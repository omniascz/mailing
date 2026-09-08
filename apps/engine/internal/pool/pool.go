// Package pool provides a per-domain SMTP connection pool.
//
// Each recipient domain gets its own pool of up to N persistent SMTP
// connections. Idle connections are reaped after a configurable timeout.
package pool

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"sync"
	"time"
)

// Conn wraps an SMTP client with metadata for pool management.
type Conn struct {
	Client    *smtp.Client
	Domain    string
	CreatedAt time.Time
	LastUsed  time.Time
	UseTLS    bool

	// LocalIP is the address this connection actually went out from, read off
	// the socket once, right after the dial.
	//
	// A STRING, not the net.Conn it came from. Ownership of that conn passes to
	// smtp.Client the moment NewClient takes it — every close path in this file
	// calls c.Client.Close() and none touches the socket directly — so keeping
	// a second reference would mean holding something somebody else closes.
	// The only thing anyone wants from it is the address, and the address does
	// not change for the life of the connection.
	//
	// This is the only place the value exists. On the bound path the caller
	// already knows which address it asked for, but on the shared pool the
	// kernel picks by routing table and nothing upstream can know the answer —
	// which is the whole reason for reading it here.
	LocalIP string
}

// Pool manages per-domain SMTP connection pools.
type Pool struct {
	mu             sync.Mutex
	pools          map[string][]*Conn
	maxPerDomain   int
	idleTimeout    time.Duration
	connectTimeout time.Duration
	readTimeout    time.Duration
	writeTimeout   time.Duration
	preferStartTLS bool
	ehloHostname   string
	closed         bool
	activeConns    int
}

// Config for creating a new Pool.
type Config struct {
	MaxConnsPerDomain int
	IdleTimeout       time.Duration
	ConnectTimeout    time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	PreferStartTLS    bool
	// EhloHostname is the name given in EHLO. Empty falls back to the reserved
	// example.invalid, which cannot resolve — see config.EhloHostname.
	EhloHostname string
}

// New creates a connection pool.
func New(cfg Config) *Pool {
	p := &Pool{
		pools:          make(map[string][]*Conn),
		maxPerDomain:   cfg.MaxConnsPerDomain,
		idleTimeout:    cfg.IdleTimeout,
		connectTimeout: cfg.ConnectTimeout,
		readTimeout:    cfg.ReadTimeout,
		writeTimeout:   cfg.WriteTimeout,
		preferStartTLS: cfg.PreferStartTLS,
		ehloHostname:   cfg.EhloHostname,
	}

	// Background reaper for idle connections
	go p.reapLoop()

	return p
}

// Get retrieves or creates an SMTP connection for the given domain. When
// requireTLS is set, only TLS-secured connections are reused/created — a
// plaintext connection is never handed out (config-set "require" TLS policy).
func (p *Pool) Get(domain string, requireTLS bool) (*Conn, error) {
	for {
		p.mu.Lock()
		if p.closed {
			p.mu.Unlock()
			return nil, fmt.Errorf("pool: closed")
		}

		// Find an eligible idle connection (scanning from the tail). Under
		// requireTLS, non-TLS connections are left in the pool for other sends.
		conns := p.pools[domain]
		idx := -1
		for i := len(conns) - 1; i >= 0; i-- {
			if requireTLS && !conns[i].UseTLS {
				continue
			}
			idx = i
			break
		}
		if idx == -1 {
			p.mu.Unlock()
			return p.dial(domain, requireTLS)
		}

		c := conns[idx]
		p.pools[domain] = append(conns[:idx], conns[idx+1:]...)
		p.mu.Unlock()

		// Verify the connection is still alive; if dead, drop it and retry.
		if err := c.Client.Noop(); err == nil {
			c.LastUsed = time.Now()
			return c, nil
		}
		c.Client.Close()
		p.mu.Lock()
		p.activeConns--
		p.mu.Unlock()
	}
}

// Put returns a connection to the pool for reuse.
func (p *Pool) Put(c *Conn) {
	if c == nil || c.Client == nil {
		return
	}

	// Reset the SMTP session for the next message
	if err := c.Client.Reset(); err != nil {
		c.Client.Close()
		p.mu.Lock()
		p.activeConns--
		p.mu.Unlock()
		return
	}

	c.LastUsed = time.Now()

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		c.Client.Close()
		p.activeConns--
		return
	}

	conns := p.pools[c.Domain]
	if len(conns) >= p.maxPerDomain {
		c.Client.Close()
		p.activeConns--
		return
	}

	p.pools[c.Domain] = append(conns, c)
}

// Discard closes a connection without returning it to the pool.
func (p *Pool) Discard(c *Conn) {
	if c == nil || c.Client == nil {
		return
	}
	c.Client.Close()
	p.mu.Lock()
	p.activeConns--
	p.mu.Unlock()
}

// DialFrom creates a direct SMTP connection to domain, binding the local TCP
// socket to localIP. The connection is NOT placed in the pool cache — the
// caller owns it and must call Discard when done.
//
// Used by the warmup subsystem: during warm-up phases only a small number of
// emails are sent per IP per day, so connection reuse is not critical.
func (p *Pool) DialFrom(domain, localIP string, requireTLS bool) (*Conn, error) {
	host, err := resolveMX(domain)
	if err != nil {
		return nil, fmt.Errorf("pool: resolve MX for %s: %w", domain, err)
	}

	addr := net.JoinHostPort(host, "25")

	var netConn net.Conn
	if localIP != "" {
		local := net.ParseIP(localIP)
		if local == nil {
			return nil, fmt.Errorf("pool: invalid local IP %q", localIP)
		}
		dialer := &net.Dialer{
			LocalAddr: &net.TCPAddr{IP: local},
			Timeout:   p.connectTimeout,
		}
		netConn, err = dialer.DialContext(context.Background(), "tcp", addr)
	} else {
		netConn, err = net.DialTimeout("tcp", addr, p.connectTimeout)
	}
	if err != nil {
		return nil, fmt.Errorf("pool: dial %s from %s: %w", addr, localIP, err)
	}

	client, err := smtp.NewClient(netConn, host)
	if err != nil {
		netConn.Close()
		return nil, fmt.Errorf("pool: smtp new client %s: %w", addr, err)
	}

	if err := client.Hello(p.ehloName()); err != nil {
		client.Close()
		return nil, fmt.Errorf("pool: EHLO %s: %w", addr, err)
	}

	useTLS, tlsErr := startTLS(client, host, p.preferStartTLS, requireTLS)
	if tlsErr != nil {
		client.Close()
		return nil, tlsErr
	}

	now := time.Now()
	return &Conn{
		Client:    client,
		Domain:    domain,
		CreatedAt: now,
		LastUsed:  now,
		UseTLS:    useTLS,
		LocalIP:   localIPOf(netConn),
	}, nil
}

// startTLS negotiates STARTTLS. Returns an error only when requireTLS is set
// and TLS could not be established (no plaintext fallback); otherwise it is
// opportunistic (best-effort, no error).
func startTLS(client *smtp.Client, host string, prefer, require bool) (bool, error) {
	if !prefer && !require {
		return false, nil
	}
	ok, _ := client.Extension("STARTTLS")
	if !ok {
		if require {
			return false, fmt.Errorf("pool: STARTTLS required but not offered by %s", host)
		}
		return false, nil
	}
	tlsCfg := &tls.Config{ServerName: host, InsecureSkipVerify: false}
	if err := client.StartTLS(tlsCfg); err != nil {
		if require {
			return false, fmt.Errorf("pool: STARTTLS required but failed for %s: %w", host, err)
		}
		return false, nil // opportunistic — continue plaintext
	}
	return true, nil
}

// Stats returns pool statistics.
func (p *Pool) Stats() (activeConns, poolSize int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	total := 0
	for _, conns := range p.pools {
		total += len(conns)
	}
	return p.activeConns, total
}

// Close shuts down all connections.
func (p *Pool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closed = true
	for domain, conns := range p.pools {
		for _, c := range conns {
			c.Client.Close()
			p.activeConns--
		}
		delete(p.pools, domain)
	}
}

// dial creates a new SMTP connection to the domain's MX host.
func (p *Pool) dial(domain string, requireTLS bool) (*Conn, error) {
	host, err := resolveMX(domain)
	if err != nil {
		return nil, fmt.Errorf("pool: resolve MX for %s: %w", domain, err)
	}

	addr := net.JoinHostPort(host, "25")
	netConn, err := net.DialTimeout("tcp", addr, p.connectTimeout)
	if err != nil {
		return nil, fmt.Errorf("pool: dial %s: %w", addr, err)
	}

	client, err := smtp.NewClient(netConn, host)
	if err != nil {
		netConn.Close()
		return nil, fmt.Errorf("pool: smtp new client %s: %w", addr, err)
	}

	// EHLO with our configured hostname
	if err := client.Hello(p.ehloName()); err != nil {
		client.Close()
		return nil, fmt.Errorf("pool: EHLO %s: %w", addr, err)
	}

	useTLS, tlsErr := startTLS(client, host, p.preferStartTLS, requireTLS)
	if tlsErr != nil {
		client.Close()
		return nil, tlsErr
	}

	now := time.Now()
	conn := &Conn{
		Client:    client,
		Domain:    domain,
		CreatedAt: now,
		LastUsed:  now,
		UseTLS:    useTLS,
		// The shared-pool path, and the only place the answer exists: nothing
		// upstream chose this address, the kernel did, by routing table.
		LocalIP: localIPOf(netConn),
	}

	p.mu.Lock()
	p.activeConns++
	p.mu.Unlock()

	return conn, nil
}

// reapLoop periodically removes idle connections.
func (p *Pool) reapLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		p.mu.Lock()
		if p.closed {
			p.mu.Unlock()
			return
		}

		now := time.Now()
		for domain, conns := range p.pools {
			var alive []*Conn
			for _, c := range conns {
				if now.Sub(c.LastUsed) > p.idleTimeout {
					c.Client.Close()
					p.activeConns--
				} else {
					alive = append(alive, c)
				}
			}
			if len(alive) == 0 {
				delete(p.pools, domain)
			} else {
				p.pools[domain] = alive
			}
		}
		p.mu.Unlock()
	}
}

// resolveMX looks up the MX records for a domain and returns the highest priority host.
func resolveMX(domain string) (string, error) {
	mxRecords, err := net.LookupMX(domain)
	if err != nil || len(mxRecords) == 0 {
		// Fall back to A record
		addrs, err2 := net.LookupHost(domain)
		if err2 != nil || len(addrs) == 0 {
			if err != nil {
				return "", err
			}
			return "", fmt.Errorf("no MX or A records for %s", domain)
		}
		return domain, nil
	}

	// MX records are returned sorted by preference (lowest = highest priority)
	best := mxRecords[0]
	for _, mx := range mxRecords[1:] {
		if mx.Pref < best.Pref {
			best = mx
		}
	}

	// Strip trailing dot from hostname
	host := strings.TrimRight(best.Host, ".")
	return host, nil
}

// localIPOf extracts the source address of a connected socket.
//
// Deliberately not LocalAddr().String(): on a TCP connection that returns
// "1.2.3.4:54321", and the port is meaningless here — it changes per
// connection and would never match a configured address.
//
// An IPv4-mapped IPv6 address is normalised to its dotted-quad form. A dual
// stack host dialling an IPv4 MX reports ::ffff:203.0.113.5 for what everyone
// else in the system calls 203.0.113.5, and the consumer joins these values
// against configured addresses by string equality.
func localIPOf(c net.Conn) string {
	if c == nil {
		return ""
	}
	if tcp, ok := c.LocalAddr().(*net.TCPAddr); ok && tcp.IP != nil {
		if v4 := tcp.IP.To4(); v4 != nil {
			return v4.String()
		}
		return tcp.IP.String()
	}
	// Not a TCP socket, or an address shape we do not recognise. Empty rather
	// than a guess: a wrong address here is attributed to a real IP's
	// reputation.
	host, _, err := net.SplitHostPort(c.LocalAddr().String())
	if err != nil {
		return ""
	}
	if ip := net.ParseIP(host); ip != nil {
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
		return ip.String()
	}
	return ""
}

// ehloName is the name this engine announces in EHLO.
//
// Configured, not hard-coded: receiving MTAs compare it against the reverse DNS
// of the connecting IP, so a name that does not resolve fails that check on
// every message to Gmail, Outlook and Seznam. It was "mta.example.invalid", a
// domain registered to nobody.
func (p *Pool) ehloName() string {
	if p.ehloHostname != "" {
		return p.ehloHostname
	}
	return "example.invalid"
}
