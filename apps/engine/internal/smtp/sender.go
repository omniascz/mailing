// Package smtp provides the core email sending logic.
//
// It composes a full RFC 5322 message from structured input, signs it with
// DKIM, and delivers it via the connection pool.
package smtp

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/forgemsg/engine/internal/dkim"
	"github.com/forgemsg/engine/internal/email"
	"github.com/forgemsg/engine/internal/pool"
	"github.com/forgemsg/engine/internal/warmup"
)

// Message represents a fully structured outgoing email.
type Message struct {
	MessageID    string
	FromEmail    string
	FromName     string
	ToEmail      string
	ToName       string
	Subject      string
	HTMLBody     string
	TextBody     string
	ReplyTo      string
	Headers      map[string]string // custom headers
	DkimConfig   *dkim.SignConfig
	SendingIP    string // optional override

	// ISP-deliverability hints (#387). Leave zero-valued to skip enrichment.
	CampaignID       string // tenant-facing identifier for Feedback-ID
	SendingDomain    string // used in Feedback-ID (e.g. "mail.forgemsg.cz")
	CampaignCategory string // Seznam X-Seznam-Campaign-Category value
	Stream           string // "broadcast" | "triggered" | "transactional"
}

// Result is the outcome of a single send attempt.
type Result struct {
	MessageID   string
	Success     bool
	SMTPCode    int
	SMTPMessage string
	Error       string
	DurationMs  int64
}

// Sender sends emails via the connection pool.
type Sender struct {
	pool       *pool.Pool
	warmupMgr  *warmup.Manager
	sendingIPs []string
}

// NewSender creates a Sender backed by the given pool.
// Pass a non-nil warmupMgr and at least one IP to enable warmup enforcement.
func NewSender(p *pool.Pool, mgr *warmup.Manager, ips []string) *Sender {
	return &Sender{pool: p, warmupMgr: mgr, sendingIPs: ips}
}

// Send delivers a single email message.
func (s *Sender) Send(msg *Message) *Result {
	start := time.Now()
	ctx := context.Background()

	domain := extractDomain(msg.ToEmail)
	if domain == "" {
		return &Result{
			MessageID: msg.MessageID,
			Error:     "invalid recipient email: no domain",
		}
	}

	// IP warmup enforcement.
	//
	// When the engine is configured with sending IPs and a warmup manager, we
	// select the best available IP before connecting. The selection prefers warm
	// (fully ramped) IPs; among warming IPs it picks the one with the most
	// remaining daily capacity.
	//
	// If msg.SendingIP is already set (explicit caller override), skip selection.
	selectedIP := msg.SendingIP
	useWarmupDial := false

	if selectedIP == "" && s.warmupMgr != nil && len(s.sendingIPs) > 0 {
		ip, err := s.warmupMgr.SelectIP(ctx, s.sendingIPs)
		if err != nil {
			// All IPs at daily cap — reject rather than queue behind the wrong IP.
			return &Result{
				MessageID:  msg.MessageID,
				Error:      err.Error(),
				DurationMs: time.Since(start).Milliseconds(),
			}
		}
		selectedIP = ip
		useWarmupDial = true
	}

	// Build the raw RFC 5322 message
	rawMsg, headers, body := buildRawMessage(msg)

	// Sign with DKIM if configured
	if msg.DkimConfig != nil && msg.DkimConfig.PrivateKeyPEM != "" {
		sig, err := dkim.Sign(*msg.DkimConfig, headers, body)
		if err != nil {
			return &Result{
				MessageID: msg.MessageID,
				Error:     fmt.Sprintf("dkim sign: %v", err),
			}
		}
		rawMsg = "DKIM-Signature: " + sig + "\r\n" + rawMsg
	}

	// Get a connection.
	// When a specific local IP is required (warmup or explicit override), dial
	// directly — pool.DialFrom binds the socket to that IP and skips the cache.
	// For the default path (no IP configured) use the pool for connection reuse.
	var conn *pool.Conn
	var connErr error
	if useWarmupDial && selectedIP != "" {
		conn, connErr = s.pool.DialFrom(domain, selectedIP)
	} else {
		conn, connErr = s.pool.Get(domain)
	}
	if connErr != nil {
		return &Result{
			MessageID:  msg.MessageID,
			Error:      fmt.Sprintf("connect: %v", connErr),
			DurationMs: time.Since(start).Milliseconds(),
		}
	}

	// SMTP envelope
	if err := conn.Client.Mail(msg.FromEmail); err != nil {
		s.pool.Discard(conn)
		code, smtpMsg := parseSmtpError(err)
		return &Result{
			MessageID:   msg.MessageID,
			SMTPCode:    code,
			SMTPMessage: smtpMsg,
			Error:       err.Error(),
			DurationMs:  time.Since(start).Milliseconds(),
		}
	}

	if err := conn.Client.Rcpt(msg.ToEmail); err != nil {
		s.pool.Discard(conn)
		code, smtpMsg := parseSmtpError(err)
		return &Result{
			MessageID:   msg.MessageID,
			SMTPCode:    code,
			SMTPMessage: smtpMsg,
			Error:       err.Error(),
			DurationMs:  time.Since(start).Milliseconds(),
		}
	}

	// Send the message body
	wc, err := conn.Client.Data()
	if err != nil {
		s.pool.Discard(conn)
		code, smtpMsg := parseSmtpError(err)
		return &Result{
			MessageID:   msg.MessageID,
			SMTPCode:    code,
			SMTPMessage: smtpMsg,
			Error:       err.Error(),
			DurationMs:  time.Since(start).Milliseconds(),
		}
	}

	if _, err := wc.Write([]byte(rawMsg)); err != nil {
		wc.Close()
		s.pool.Discard(conn)
		return &Result{
			MessageID:  msg.MessageID,
			Error:      fmt.Sprintf("write data: %v", err),
			DurationMs: time.Since(start).Milliseconds(),
		}
	}

	if err := wc.Close(); err != nil {
		s.pool.Discard(conn)
		code, smtpMsg := parseSmtpError(err)
		return &Result{
			MessageID:   msg.MessageID,
			SMTPCode:    code,
			SMTPMessage: smtpMsg,
			Error:       err.Error(),
			DurationMs:  time.Since(start).Milliseconds(),
		}
	}

	// Return the connection for reuse (warmup connections are always discarded
	// since they are not tracked in the pool cache).
	if useWarmupDial {
		s.pool.Discard(conn)
		// Record the send against the warmup counter for this IP.
		if err := s.warmupMgr.RecordSend(ctx, selectedIP); err != nil {
			log.Printf("[warmup] RecordSend %s: %v", selectedIP, err)
		}
	} else {
		s.pool.Put(conn)
	}

	return &Result{
		MessageID:   msg.MessageID,
		Success:     true,
		SMTPCode:    250,
		SMTPMessage: "OK",
		DurationMs:  time.Since(start).Milliseconds(),
	}
}

// buildRawMessage constructs the RFC 5322 message and returns:
//   - full raw message string
//   - headers map (for DKIM signing)
//   - body string (for DKIM signing)
func buildRawMessage(msg *Message) (string, map[string]string, string) {
	headers := make(map[string]string)

	// Format From/To with display names
	from := msg.FromEmail
	if msg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", msg.FromName, msg.FromEmail)
	}
	to := msg.ToEmail
	if msg.ToName != "" {
		to = fmt.Sprintf("%s <%s>", msg.ToName, msg.ToEmail)
	}

	headers["from"] = from
	headers["to"] = to
	headers["subject"] = msg.Subject
	headers["date"] = time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 -0700")
	headers["message-id"] = fmt.Sprintf("<%s>", msg.MessageID)
	headers["mime-version"] = "1.0"

	// Build MIME body
	var body string
	boundary := fmt.Sprintf("forgemsg_%s", msg.MessageID[:8])

	if msg.TextBody != "" && msg.HTMLBody != "" {
		headers["content-type"] = fmt.Sprintf("multipart/alternative; boundary=%q", boundary)
		body = fmt.Sprintf(
			"--%s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n%s\r\n--%s\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n%s\r\n--%s--\r\n",
			boundary, msg.TextBody, boundary, msg.HTMLBody, boundary,
		)
	} else if msg.HTMLBody != "" {
		headers["content-type"] = "text/html; charset=utf-8"
		body = msg.HTMLBody
	} else {
		headers["content-type"] = "text/plain; charset=utf-8"
		body = msg.TextBody
	}

	// Add reply-to
	if msg.ReplyTo != "" {
		headers["reply-to"] = msg.ReplyTo
	}

	// Custom headers
	for k, v := range msg.Headers {
		headers[strings.ToLower(k)] = v
	}

	// ISP-specific deliverability hints (Seznam + CZ ISPs) — #387.
	// Must run after caller-supplied headers so callers can still override.
	email.ApplyIspHeaders(headers, msg.ToEmail, email.IspHeaderOptions{
		CampaignID:       msg.CampaignID,
		SendingDomain:    msg.SendingDomain,
		CampaignCategory: msg.CampaignCategory,
		Stream:           msg.Stream,
	})

	// Build the raw header block
	// Standard header order for readability
	headerOrder := []string{
		"from", "to", "subject", "date", "message-id",
		"mime-version", "content-type", "reply-to",
		"list-unsubscribe", "list-unsubscribe-post",
		"precedence", "auto-submitted", "feedback-id",
		"x-seznam-campaign-category",
	}

	var raw strings.Builder
	written := make(map[string]bool)

	for _, name := range headerOrder {
		if val, ok := headers[name]; ok {
			raw.WriteString(headerName(name) + ": " + val + "\r\n")
			written[name] = true
		}
	}

	// Write remaining custom headers
	for name, val := range headers {
		if !written[name] {
			raw.WriteString(headerName(name) + ": " + val + "\r\n")
		}
	}

	// Blank line separating headers from body
	raw.WriteString("\r\n")
	raw.WriteString(body)

	return raw.String(), headers, body
}

// headerName converts a lowercase header name to its canonical form.
func headerName(name string) string {
	parts := strings.Split(name, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, "-")
}

func extractDomain(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 || at == len(email)-1 {
		return ""
	}
	return email[at+1:]
}

// parseSmtpError tries to extract an SMTP status code from an error.
func parseSmtpError(err error) (int, string) {
	if err == nil {
		return 0, ""
	}
	msg := err.Error()
	// net/smtp errors start with "NNN " or "NNN-"
	if len(msg) >= 3 {
		code := 0
		for i := 0; i < 3; i++ {
			if msg[i] < '0' || msg[i] > '9' {
				return 0, msg
			}
			code = code*10 + int(msg[i]-'0')
		}
		return code, msg
	}
	return 0, msg
}
