// Package submission implements a customer-facing SMTP submission server
// (port 587 / 465), the ForgeMsg equivalent of Amazon SES's SMTP interface.
//
// Clients authenticate with SMTP credentials issued by the API (AUTH LOGIN /
// AUTH PLAIN). On DATA the raw message is relayed to the API's internal relay
// endpoint, which parses it and enqueues it onto the same MTA pipeline the HTTP
// send API uses. STARTTLS is offered when a cert is configured; in production
// behind a TLS-terminating proxy the listener may run plaintext.
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

type Config struct {
	ListenAddr string // e.g. ":587"
	Hostname   string // advertised in banner/EHLO
	APIURL     string // base API URL, e.g. http://localhost:3001
	APISecret  string // shared secret → X-Internal-Secret
	MaxSize    int64  // max message bytes (default 30 MiB)
	TLSCert    string // optional PEM cert path → enables STARTTLS + AUTH gating
	TLSKey     string // optional PEM key path
}

type Server struct {
	cfg       Config
	tlsConfig *tls.Config
	client    *http.Client
}

func New(cfg Config) (*Server, error) {
	if cfg.MaxSize == 0 {
		cfg.MaxSize = 30 * 1024 * 1024
	}
	if cfg.Hostname == "" {
		cfg.Hostname = "smtp.forgemsg.local"
	}
	s := &Server{cfg: cfg, client: &http.Client{Timeout: 30 * time.Second}}
	if cfg.TLSCert != "" && cfg.TLSKey != "" {
		cert, err := tls.LoadX509KeyPair(cfg.TLSCert, cfg.TLSKey)
		if err != nil {
			return nil, fmt.Errorf("submission tls: %w", err)
		}
		s.tlsConfig = &tls.Config{Certificates: []tls.Certificate{cert}}
	}
	return s, nil
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
	srv    *Server
	conn   net.Conn
	rw     *bufio.ReadWriter
	authed bool
	orgID  string
	from   string
	rcpts  []string
	usedTLS bool
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
			ext = append(ext, "AUTH LOGIN PLAIN")
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
			ss.handleAuth(line)
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

func (ss *session) handleAuth(line string) {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		ss.reply(501, "syntax")
		return
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
			return
		}
		// authzid\0authcid\0passwd
		parts := bytes.Split(dec, []byte{0})
		if len(parts) != 3 {
			ss.reply(501, "invalid PLAIN")
			return
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
		return
	}

	orgID, err := ss.srv.authenticate(user, pass)
	if err != nil || orgID == "" {
		ss.reply(535, "authentication failed")
		return
	}
	ss.authed = true
	ss.orgID = orgID
	ss.reply(235, "authentication successful")
}

func (s *Server) authenticate(user, pass string) (string, error) {
	body, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	req, err := http.NewRequest("POST", s.cfg.APIURL+"/api/v1/internal/smtp/auth", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.cfg.APISecret != "" {
		req.Header.Set("X-Internal-Secret", s.cfg.APISecret)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", nil
	}
	var out struct {
		Data struct {
			OrgID string `json:"orgId"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.Data.OrgID, nil
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
