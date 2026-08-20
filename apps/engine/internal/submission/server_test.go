package submission

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// newTestServer builds a submission Server whose auth/relay calls hit a stub
// API, with backoff sleeps disabled so tests run in real time.
func newTestServer(t *testing.T, cfg Config, apiHandler http.HandlerFunc) (*Server, func()) {
	t.Helper()
	api := httptest.NewServer(apiHandler)
	cfg.APIURL = api.URL
	if cfg.Hostname == "" {
		cfg.Hostname = "test.local"
	}
	if cfg.APISecret == "" {
		cfg.APISecret = "test-secret"
	}
	s, err := New(cfg)
	if err != nil {
		api.Close()
		t.Fatalf("New: %v", err)
	}
	s.sleep = func(time.Duration) {} // never actually sleep
	return s, api.Close
}

// dialSession runs one session over an in-memory pipe and returns a client that
// can send lines and read replies.
type client struct {
	conn net.Conn
	r    *bufio.Reader
}

func startSession(s *Server) *client {
	c, srv := net.Pipe()
	go s.handle(srv)
	return &client{conn: c, r: bufio.NewReader(c)}
}

func (c *client) send(line string) { fmt.Fprintf(c.conn, "%s\r\n", line) }

// readReply reads one SMTP reply line (handles multiline by returning the last).
func (c *client) readReply(t *testing.T) (int, string) {
	t.Helper()
	c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		line, err := c.r.ReadString('\n')
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if len(line) < 4 {
			continue
		}
		// Continuation lines have '-' at position 3; the final has ' '.
		if line[3] == '-' {
			continue
		}
		var code int
		fmt.Sscanf(line[:3], "%d", &code)
		return code, line
	}
}

func (c *client) close() { c.conn.Close() }

const insecureCfg = true // AllowInsecureAuth for tests that skip STARTTLS

// ── F3: AUTH refused without TLS ──────────────────────────────────────────────

func TestNew_refusesToStartWithoutAPISecret(t *testing.T) {
	// F5: the API rejects every /internal/* call without the shared secret, so a
	// submission server with no secret is dead on arrival — refuse to start.
	_, err := New(Config{ListenAddr: ":0", AllowInsecureAuth: true})
	if err == nil {
		t.Fatal("expected New to refuse a server with an empty APISecret")
	}
	if !strings.Contains(err.Error(), "INTERNAL_API_SECRET") {
		t.Fatalf("error should name the env var, got: %v", err)
	}
}

func TestNew_refusesToStartWithoutTLSorInsecureOptIn(t *testing.T) {
	// APISecret is set here so New() reaches the TLS/insecure check rather than
	// stopping earlier on the missing secret.
	_, err := New(Config{ListenAddr: ":0", APISecret: "s"})
	if err == nil {
		t.Fatal("expected New to refuse a server with no TLS and no AllowInsecureAuth")
	}
	if !strings.Contains(err.Error(), "SUBMISSION_ALLOW_INSECURE_AUTH") {
		t.Fatalf("error should name the opt-in env var, got: %v", err)
	}
}

// plaintextServer builds an unencrypted server (no TLS, no insecure opt-in) by
// bypassing New()'s start-up guard, for the tests that assert AUTH is refused
// without encryption. It carries a stub API + no-op sleep so that if the 538
// gate is ever removed, the code reaches a clean 535 assertion rather than a
// nil-client panic.
func plaintextServer(status int) *Server {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	}))
	return &Server{
		cfg:    Config{Hostname: "h", MaxSize: 1000, APIURL: api.URL},
		client: &http.Client{Timeout: 3 * time.Second},
		sleep:  func(time.Duration) {},
	}
}

func TestEHLO_doesNotAdvertiseAUTHwithoutEncryption(t *testing.T) {
	// A plaintext connection: no TLS used, no insecure opt-in → AUTH must not be
	// advertised.
	s := plaintextServer(401)
	c := startSession(s)
	defer c.close()
	c.readReply(t) // banner
	c.send("EHLO probe")
	var lines []string
	c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		line, err := c.r.ReadString('\n')
		if err != nil {
			t.Fatalf("read ehlo: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		lines = append(lines, line)
		if len(line) >= 4 && line[3] == ' ' {
			break
		}
	}
	for _, l := range lines {
		if strings.Contains(strings.ToUpper(l), "AUTH") {
			t.Fatalf("EHLO advertised AUTH on an unencrypted connection: %q", l)
		}
	}
}

func TestAUTH_rejectedWith538WithoutEncryption(t *testing.T) {
	// Stub API returns 401 (would be a wrong-password 535) so that if the 538
	// gate is removed, this fails on the code assertion, not a nil-client panic.
	s := plaintextServer(401)
	c := startSession(s)
	defer c.close()
	c.readReply(t) // banner
	c.send("EHLO probe")
	c.readReply(t)
	c.send("AUTH LOGIN")
	code, msg := c.readReply(t)
	if code != 538 {
		t.Fatalf("expected 538 (encryption required), got %d %q", code, msg)
	}
}

func TestAUTH_offeredWhenInsecureOptIn(t *testing.T) {
	s, done := newTestServer(t, Config{MaxSize: 1000, AllowInsecureAuth: insecureCfg},
		func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			fmt.Fprint(w, `{"data":{"orgId":"org-1"}}`)
		})
	defer done()
	c := startSession(s)
	defer c.close()
	c.readReply(t)
	c.send("EHLO probe")
	// drain EHLO, assert AUTH present
	sawAuth := false
	c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		line, _ := c.r.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.Contains(strings.ToUpper(line), "AUTH") {
			sawAuth = true
		}
		if len(line) >= 4 && line[3] == ' ' {
			break
		}
	}
	if !sawAuth {
		t.Fatal("AUTH should be advertised when AllowInsecureAuth is set")
	}
	c.send("AUTH LOGIN")
	if code, _ := c.readReply(t); code != 334 {
		t.Fatalf("expected 334 username prompt, got %d", code)
	}
}

// ── F4: lockout after N, and 429→451 mapping ─────────────────────────────────

func authClient(t *testing.T, c *client, user, pass string) (int, string) {
	t.Helper()
	c.send("AUTH LOGIN")
	c.readReply(t) // 334 Username
	c.send(base64.StdEncoding.EncodeToString([]byte(user)))
	c.readReply(t) // 334 Password
	c.send(base64.StdEncoding.EncodeToString([]byte(pass)))
	return c.readReply(t)
}

func TestAUTH_lockoutAfterMaxFailures(t *testing.T) {
	s, done := newTestServer(t, Config{MaxSize: 1000, AllowInsecureAuth: insecureCfg},
		func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(401) // always wrong password
		})
	defer done()
	c := startSession(s)
	defer c.close()
	c.readReply(t) // banner
	c.send("EHLO probe")
	drainEHLO(t, c)

	for i := 1; i < maxAuthFailures; i++ {
		if code, _ := authClient(t, c, "u", "wrong"); code != 535 {
			t.Fatalf("attempt %d: expected 535, got %d", i, code)
		}
	}
	// The maxAuthFailures-th failure closes the connection with 421.
	code, msg := authClient(t, c, "u", "wrong")
	if code != 421 {
		t.Fatalf("expected 421 close after %d failures, got %d %q", maxAuthFailures, code, msg)
	}
}

func TestAUTH_rateLimitedMapsTo451NotAuthFailure(t *testing.T) {
	var calls int32
	s, done := newTestServer(t, Config{MaxSize: 1000, AllowInsecureAuth: insecureCfg},
		func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&calls, 1)
			w.WriteHeader(429) // API rate limited, NOT a wrong password
		})
	defer done()
	c := startSession(s)
	defer c.close()
	c.readReply(t)
	c.send("EHLO probe")
	drainEHLO(t, c)

	// Many 429s in a row must all be 451 and must NOT trip the lockout — a
	// rate-limited API is not the user's fault.
	for i := 0; i < maxAuthFailures+3; i++ {
		code, msg := authClient(t, c, "u", "p")
		if code != 451 {
			t.Fatalf("attempt %d: expected 451 (temporary), got %d %q", i, code, msg)
		}
	}
}

// ── F6: recipient cap ─────────────────────────────────────────────────────────

func TestRCPT_cappedAt100With452(t *testing.T) {
	relayHits := int32(0)
	s, done := newTestServer(t, Config{MaxSize: 1 << 20, AllowInsecureAuth: insecureCfg},
		func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "/auth") {
				w.WriteHeader(200)
				fmt.Fprint(w, `{"data":{"orgId":"org-1"}}`)
				return
			}
			atomic.AddInt32(&relayHits, 1)
			w.WriteHeader(200)
			fmt.Fprint(w, `{"data":{}}`)
		})
	defer done()
	c := startSession(s)
	defer c.close()
	c.readReply(t)
	c.send("EHLO probe")
	drainEHLO(t, c)
	if code, _ := authClient(t, c, "u", "p"); code != 235 {
		t.Fatal("auth should succeed")
	}
	c.send("MAIL FROM:<a@b.test>")
	c.readReply(t)

	accepted, rejected := 0, 0
	for i := 0; i < maxRecipients+50; i++ {
		c.send(fmt.Sprintf("RCPT TO:<u%d@x.test>", i))
		code, _ := c.readReply(t)
		switch code {
		case 250:
			accepted++
		case 452:
			rejected++
		default:
			t.Fatalf("unexpected RCPT reply %d", code)
		}
	}
	if accepted != maxRecipients {
		t.Fatalf("expected exactly %d accepted, got %d", maxRecipients, accepted)
	}
	if rejected != 50 {
		t.Fatalf("expected 50 rejected with 452, got %d", rejected)
	}
}

// ── F6: DATA size cap is enforced (point 11) ─────────────────────────────────
//
// readDotData is exercised directly rather than over the session pipe: an
// oversized body would deadlock a synchronous net.Pipe (the server stops reading
// mid-write), which is a test-harness artifact, not the behaviour under test.

func TestReadDotData_underLimitReadsWholeBody(t *testing.T) {
	body := "Subject: ok\r\n\r\nsmall body\r\n.\r\n"
	got, err := readDotData(bufio.NewReader(strings.NewReader(body)), 1024)
	if err != nil {
		t.Fatalf("unexpected error under limit: %v", err)
	}
	if !strings.Contains(string(got), "small body") {
		t.Fatalf("body not read back: %q", got)
	}
}

func TestReadDotData_overLimitRejected(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("Subject: big\r\n\r\n")
	for i := 0; i < 100; i++ {
		sb.WriteString("this line pads the body well past the max size limit\r\n")
	}
	sb.WriteString(".\r\n")
	_, err := readDotData(bufio.NewReader(strings.NewReader(sb.String())), 512)
	if err == nil {
		t.Fatal("expected readDotData to reject a body over MaxSize")
	}
	if !strings.Contains(err.Error(), "max size") {
		t.Fatalf("expected a max-size error, got: %v", err)
	}
}

func drainEHLO(t *testing.T, c *client) {
	t.Helper()
	c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		line, err := c.r.ReadString('\n')
		if err != nil {
			t.Fatalf("drain ehlo: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if len(line) >= 4 && line[3] == ' ' {
			return
		}
	}
}
