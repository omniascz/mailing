// Package submission implements a customer-facing SMTP submission server
// (port 587, STARTTLS), the ForgeMsg equivalent of Amazon SES's SMTP interface.
//
// Clients authenticate with SMTP credentials issued by the API (AUTH LOGIN /
// AUTH PLAIN). On DATA the raw message is relayed to the API's internal relay
// endpoint, which parses it and enqueues it onto the same MTA pipeline the HTTP
// send API uses.
//
// AUTH is only offered on an encrypted connection: after STARTTLS, or when the
// operator sets AllowInsecureAuth for a listener that sits behind TLS
// termination. A server that can do neither refuses to start rather than run
// silently useless or carry credentials in the clear by accident. Implicit TLS
// (port 465) is not implemented — the listener is plaintext-first — so it is
// not advertised to customers.
package submission

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// maxRecipients caps RCPT TO per message, matching the API relay's
// z.array().max(100). Without it the server accepted an unbounded list and held
// every address in memory before the API ever saw (and rejected) the payload.
const maxRecipients = 100

// maxAuthFailures is how many failed AUTH attempts one connection may make
// before it is closed. RFC 4954 §5.2 recommends limiting attempts; 5 is lenient
// enough for a human fat-fingering AUTH LOGIN, tight enough to make online
// brute force on a single connection pointless.
const maxAuthFailures = 5

type Config struct {
	ListenAddr string // e.g. ":587"
	Hostname   string // advertised in banner/EHLO
	APIURL     string // base API URL, e.g. http://localhost:3001
	APISecret  string // shared secret → X-Internal-Secret
	MaxSize    int64  // max message bytes (default 30 MiB)
	TLSCert    string // PEM cert path → enables STARTTLS (and thus AUTH)
	TLSKey     string // PEM key path
	// AllowInsecureAuth permits AUTH on a connection that is not TLS-encrypted.
	// Required for local dev without a cert, and for production behind a
	// TLS-terminating proxy (the socket carries plaintext but the hop to the
	// client is encrypted upstream). It is an explicit opt-in precisely because
	// "no cert" alone cannot tell those two safe cases apart from an accidental
	// plaintext deployment — so we make the operator say so.
	AllowInsecureAuth bool
}

type Server struct {
	cfg       Config
	tlsConfig *tls.Config
	client    *http.Client
	// sleep is the backoff sleep, injectable so tests do not wait in real time.
	sleep func(time.Duration)
}

func New(cfg Config) (*Server, error) {
	if cfg.MaxSize == 0 {
		cfg.MaxSize = 30 * 1024 * 1024
	}
	if cfg.Hostname == "" {
		cfg.Hostname = "smtp.forgemsg.local"
	}
	s := &Server{cfg: cfg, client: &http.Client{Timeout: 30 * time.Second}, sleep: time.Sleep}
	if cfg.TLSCert != "" && cfg.TLSKey != "" {
		cert, err := tls.LoadX509KeyPair(cfg.TLSCert, cfg.TLSKey)
		if err != nil {
			return nil, fmt.Errorf("submission tls: %w", err)
		}
		s.tlsConfig = &tls.Config{Certificates: []tls.Certificate{cert}}
	}

	// A submission server that can neither offer STARTTLS nor was told plaintext
	// AUTH is acceptable can never authenticate anyone — it would advertise no
	// AUTH and reject every login. Rather than run silently useless (or, worse,
	// carry credentials in the clear by accident), refuse to start.
	if s.tlsConfig == nil && !cfg.AllowInsecureAuth {
		return nil, fmt.Errorf(
			"submission: no TLS cert and SUBMISSION_ALLOW_INSECURE_AUTH not set — " +
				"refusing to start a server that would either advertise no AUTH or carry " +
				"credentials in plaintext. Configure SUBMISSION_TLS_CERT/KEY, or set " +
				"SUBMISSION_ALLOW_INSECURE_AUTH=1 if this listener sits behind TLS termination",
		)
	}
	if cfg.AllowInsecureAuth && s.tlsConfig == nil {
		log.Printf("submission: WARNING — AUTH is permitted on unencrypted connections " +
			"(SUBMISSION_ALLOW_INSECURE_AUTH=1, no TLS cert). This is only safe behind a " +
			"TLS-terminating proxy; never expose this listener directly to the internet.")
	}
	return s, nil
}

// authAllowed reports whether AUTH may proceed on this connection: either the
// connection negotiated STARTTLS, or the operator opted into plaintext auth.
func (ss *session) authAllowed() bool {
	return ss.usedTLS || ss.srv.cfg.AllowInsecureAuth
}

// backoff sleeps a little longer after each failed attempt on this connection
// (0.5s, 1s, 1.5s, …), capped, so an online guesser is slowed without letting
// the delay pin the connection open — maxAuthFailures closes it regardless.
func (ss *session) backoff() {
	if ss.srv.sleep == nil {
		return
	}
	d := time.Duration(ss.authFailures) * 500 * time.Millisecond
	if d > 2*time.Second {
		d = 2 * time.Second
	}
	if d > 0 {
		ss.srv.sleep(d)
	}
}

func (s *Server) ListenAndServe() error {
	ln, err := net.Listen("tcp", s.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", s.cfg.ListenAddr, err)
	}
	log.Printf("submission: SMTP server listening on %s (STARTTLS=%v)", s.cfg.ListenAddr, s.tlsConfig != nil)
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("submission: accept: %v", err)
			continue
		}
		go s.handle(conn)
	}
}

type session struct {
	srv          *Server
	conn         net.Conn
	rw           *bufio.ReadWriter
	authed       bool
	orgID        string
	from         string
	rcpts        []string
	usedTLS      bool
	authFailures int
}

func (s *Server) handle(conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Minute))
	sess := &session{
		srv:  s,
		conn: conn,
		rw:   bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn)),
	}
	sess.reply(220, s.cfg.Hostname+" ESMTP forgemsg-submission")
	sess.loop()
}

func (ss *session) reply(code int, msg string) {
	fmt.Fprintf(ss.rw, "%d %s\r\n", code, msg)
	ss.rw.Flush()
}

func (ss *session) replyMulti(code int, lines []string) {
	for i, l := range lines {
		sep := "-"
		if i == len(lines)-1 {
			sep = " "
		}
		fmt.Fprintf(ss.rw, "%d%s%s\r\n", code, sep, l)
	}
	ss.rw.Flush()
}

func (ss *session) readLine() (string, error) {
	ss.conn.SetDeadline(time.Now().Add(5 * time.Minute))
	line, err := ss.rw.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func (ss *session) loop() {
	for {
		line, err := ss.readLine()
		if err != nil {
			return
		}
		upper := strings.ToUpper(line)
		switch {
		case strings.HasPrefix(upper, "EHLO"):
			ext := []string{ss.srv.cfg.Hostname, "SIZE " + itoa(ss.srv.cfg.MaxSize), "8BITMIME"}
			if ss.srv.tlsConfig != nil && !ss.usedTLS {
				ext = append(ext, "STARTTLS")
			}
			// Advertise AUTH only where it may actually be used: after STARTTLS,
			// or when plaintext auth is explicitly permitted. A client that sees
			// no AUTH before STARTTLS knows to upgrade first, per RFC 3207.
			if ss.authAllowed() {
				ext = append(ext, "AUTH LOGIN PLAIN")
			}
			ss.replyMulti(250, ext)
		case strings.HasPrefix(upper, "HELO"):
			ss.reply(250, ss.srv.cfg.Hostname)
		case strings.HasPrefix(upper, "STARTTLS"):
			if ss.srv.tlsConfig == nil {
				ss.reply(454, "TLS not available")
				continue
			}
			ss.reply(220, "ready to start TLS")
			tlsConn := tls.Server(ss.conn, ss.srv.tlsConfig)
			if err := tlsConn.Handshake(); err != nil {
				return
			}
			ss.conn = tlsConn
			ss.rw = bufio.NewReadWriter(bufio.NewReader(tlsConn), bufio.NewWriter(tlsConn))
			ss.usedTLS = true
			ss.authed, ss.from, ss.rcpts = false, "", nil // reset per RFC 3207
		case strings.HasPrefix(upper, "AUTH"):
			// AUTH is refused outright on an unencrypted connection (unless
			// plaintext auth is permitted). 538 is the RFC 4954 code for
			// "encryption required for requested authentication mechanism" —
			// distinct from 502 (unknown command), so a client knows to STARTTLS.
			if !ss.authAllowed() {
				ss.reply(538, "Encryption required for requested authentication mechanism")
				continue
			}
			if ss.authed {
				ss.reply(503, "already authenticated")
				continue
			}
			if ss.handleAuth(line) == authClose {
				return
			}
		case strings.HasPrefix(upper, "MAIL FROM:"):
			if !ss.authed {
				ss.reply(530, "authentication required")
				continue
			}
			ss.from = extractAddr(line[10:])
			ss.rcpts = nil
			ss.reply(250, "OK")
		case strings.HasPrefix(upper, "RCPT TO:"):
			if !ss.authed {
				ss.reply(530, "authentication required")
				continue
			}
			// Cap recipients at the same 100 the API relay enforces. Without
			// this the server accepted an unbounded list and marshalled the whole
			// thing into memory before the API ever saw it — a million RCPTs
			// pushed engine RSS from ~14 MB to ~260 MB in the probe. 452 is the
			// RFC 5321 code for "too many recipients".
			if len(ss.rcpts) >= maxRecipients {
				ss.reply(452, "Too many recipients (max "+itoa(maxRecipients)+")")
				continue
			}
			ss.rcpts = append(ss.rcpts, extractAddr(line[8:]))
			ss.reply(250, "OK")
		case upper == "DATA":
			if !ss.authed || ss.from == "" || len(ss.rcpts) == 0 {
				ss.reply(503, "bad sequence")
				continue
			}
			ss.reply(354, "End data with <CR><LF>.<CR><LF>")
			raw, err := readDotData(ss.rw.Reader, ss.srv.cfg.MaxSize)
			if err != nil {
				ss.reply(552, "message too large or read error")
				continue
			}
			if err := ss.relay(raw); err != nil {
				log.Printf("submission: relay: %v", err)
				ss.reply(451, "temporary failure, try again later")
				continue
			}
			ss.reply(250, "OK: queued")
			ss.from, ss.rcpts = "", nil
		case upper == "RSET":
			ss.from, ss.rcpts = "", nil
			ss.reply(250, "OK")
		case upper == "NOOP":
			ss.reply(250, "OK")
		case upper == "QUIT":
			ss.reply(221, "bye")
			return
		default:
			ss.reply(502, "command not recognised")
		}
	}
}

// authOutcome tells the loop whether to keep the connection open.
type authOutcome int

const (
	authKeepOpen authOutcome = iota
	authClose
)

// fail records one failed attempt and replies, closing the connection with 421
// once the per-connection cap is reached, otherwise 535 followed by a short
// backoff. Returns authClose when the caller must drop the connection.
func (ss *session) fail() authOutcome {
	ss.authFailures++
	if ss.authFailures >= maxAuthFailures {
		ss.reply(421, "Too many failed authentication attempts, closing connection")
		return authClose
	}
	ss.reply(535, "authentication failed")
	ss.backoff()
	return authKeepOpen
}

func (ss *session) handleAuth(line string) authOutcome {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		ss.reply(501, "syntax")
		return authKeepOpen
	}
	mech := strings.ToUpper(fields[1])
	var user, pass string
	switch mech {
	case "PLAIN":
		var blob string
		if len(fields) >= 3 {
			blob = fields[2]
		} else {
			ss.reply(334, "")
			blob, _ = ss.readLine()
		}
		dec, err := base64.StdEncoding.DecodeString(strings.TrimSpace(blob))
		if err != nil {
			ss.reply(501, "invalid base64")
			return authKeepOpen
		}
		// authzid\0authcid\0passwd
		parts := bytes.Split(dec, []byte{0})
		if len(parts) != 3 {
			ss.reply(501, "invalid PLAIN")
			return authKeepOpen
		}
		user, pass = string(parts[1]), string(parts[2])
	case "LOGIN":
		ss.reply(334, base64.StdEncoding.EncodeToString([]byte("Username:")))
		u, _ := ss.readLine()
		ub, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(u))
		ss.reply(334, base64.StdEncoding.EncodeToString([]byte("Password:")))
		p, _ := ss.readLine()
		pb, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(p))
		user, pass = string(ub), string(pb)
	default:
		ss.reply(504, "unsupported auth mechanism")
		return authKeepOpen
	}

	orgID, retryable, err := ss.srv.authenticate(user, pass)
	if retryable {
		// The API could not give a verdict (rate limited, unavailable, network
		// error). This is NOT a wrong password — answer 451 so the client backs
		// off and retries, rather than 535 which would make it discard a good
		// credential. Does not count against the per-connection failure cap.
		if err != nil {
			log.Printf("submission: auth temporarily unavailable: %v", err)
		}
		ss.reply(451, "Authentication temporarily unavailable, please retry")
		return authKeepOpen
	}
	if err != nil || orgID == "" {
		return ss.fail()
	}
	ss.authed = true
	ss.orgID = orgID
	ss.authFailures = 0
	ss.reply(235, "authentication successful")
	return authKeepOpen
}

// authenticate asks the API to validate the SMTP credential. It returns the
// orgID on success. The `retryable` flag separates "the API said no" (wrong
// password → 535) from "the API could not answer" (rate limited / down /
// network → 451): only the former is a real authentication failure.
func (s *Server) authenticate(user, pass string) (orgID string, retryable bool, err error) {
	body, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	req, err := http.NewRequest("POST", s.cfg.APIURL+"/api/v1/internal/smtp/auth", bytes.NewReader(body))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.cfg.APISecret != "" {
		req.Header.Set("X-Internal-Secret", s.cfg.APISecret)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		// Transport failure — the API may be momentarily unreachable. Retryable.
		return "", true, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == 200:
		// fall through to decode
	case resp.StatusCode == 401 || resp.StatusCode == 403:
		// A definitive "no" from the API: wrong credential.
		return "", false, nil
	case resp.StatusCode == 429 || resp.StatusCode >= 500:
		// Rate limited or server error — not a credential verdict. Retryable.
		return "", true, fmt.Errorf("auth endpoint status %d", resp.StatusCode)
	default:
		// Any other unexpected status: treat as a non-verdict, retryable, rather
		// than silently rejecting a possibly-valid login.
		return "", true, fmt.Errorf("auth endpoint status %d", resp.StatusCode)
	}
	var out struct {
		Data struct {
			OrgID string `json:"orgId"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", true, err
	}
	if out.Data.OrgID == "" {
		return "", false, nil
	}
	return out.Data.OrgID, false, nil
}

func (ss *session) relay(raw []byte) error {
	payload := map[string]any{
		"orgId":    ss.orgID,
		"raw":      base64.StdEncoding.EncodeToString(raw),
		"mailFrom": ss.from,
		"rcptTo":   ss.rcpts,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", ss.srv.cfg.APIURL+"/api/v1/internal/smtp/relay", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if ss.srv.cfg.APISecret != "" {
		req.Header.Set("X-Internal-Secret", ss.srv.cfg.APISecret)
	}
	resp, err := ss.srv.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("relay status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// readDotData reads until the SMTP dot terminator, undoing dot-stuffing.
func readDotData(r *bufio.Reader, max int64) ([]byte, error) {
	var buf bytes.Buffer
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "." {
			break
		}
		if strings.HasPrefix(trimmed, ".") {
			trimmed = trimmed[1:] // undo dot-stuffing
		}
		buf.WriteString(trimmed)
		buf.WriteString("\r\n")
		if int64(buf.Len()) > max {
			return nil, fmt.Errorf("message exceeds max size")
		}
	}
	return buf.Bytes(), nil
}

func extractAddr(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "<"); i >= 0 {
		if j := strings.Index(s[i:], ">"); j > 0 {
			return s[i+1 : i+j]
		}
	}
	if sp := strings.IndexAny(s, " \t"); sp >= 0 {
		s = s[:sp]
	}
	return s
}

func itoa(n int64) string {
	return fmt.Sprintf("%d", n)
}
