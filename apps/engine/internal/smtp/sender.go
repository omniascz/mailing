// Package smtp provides the core email sending logic.
//
// It composes a full RFC 5322 message from structured input, signs it with
// DKIM, and delivers it via the connection pool.
package smtp

import (
	"context"
	"encoding/base64"
	"fmt"
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
	ReturnPath   string // VERP envelope sender (MAIL FROM); empty = FromEmail
	TLSPolicy    string // "require" = abort if no STARTTLS; else opportunistic
	RawMIME      string // when set, relayed verbatim (SendRawEmail); skips build+DKIM

	// ISP-deliverability hints (#387). Leave zero-valued to skip enrichment.
	CampaignID       string // tenant-facing identifier for Feedback-ID
	SendingDomain    string // used in Feedback-ID (e.g. "mail.forgemsg.cz")
	CampaignCategory string // Seznam X-Seznam-Campaign-Category value
	Stream           string // "broadcast" | "triggered" | "transactional"

	// File attachments (e.g. e-ticket PDFs). Empty = link-only email.
	Attachments []Attachment
}

// Attachment is a file part for multipart/mixed emails.
type Attachment struct {
	Filename    string
	ContentType string // MIME type; defaults to application/octet-stream
	Content     []byte // raw bytes
	ContentID   string // for inline images referenced as cid:<id>
	Inline      bool   // true → Content-Disposition: inline
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
	if selectedIP == "" && s.warmupMgr != nil && len(s.sendingIPs) > 0 {
		// Claim spends the allowance as well as choosing the IP, so there is no
		// second call after delivery and no window where two sends both take
		// the last unit. An attempt counts whether or not it lands: what the
		// receiving ISP saw is a connection from this IP, which is the thing
		// being rationed.
		ip, err := s.warmupMgr.Claim(ctx, s.sendingIPs)
		if err != nil {
			// Out of allowance, or the counter is unreachable. Either way do not
			// send: the workers' send path recognises the exhausted message and
			// defers it to midnight rather than failing it.
			return &Result{
				MessageID:  msg.MessageID,
				Error:      err.Error(),
				DurationMs: time.Since(start).Milliseconds(),
			}
		}
		selectedIP = ip
	}

	// Build the message. When the caller supplied raw MIME, relay it verbatim
	// (SendRawEmail semantics) — do NOT recompose or auto-sign, since that would
	// break S/MIME and any pre-applied DKIM signature the caller already added.
	var rawMsg string
	if msg.RawMIME != "" {
		rawMsg = msg.RawMIME
	} else {
		var headers map[string]string
		var body string
		rawMsg, headers, body = buildRawMessage(msg)

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
	}

	// Get a connection.
	// When a specific local IP is required (warmup OR an explicit dedicated-IP
	// override), dial directly — pool.DialFrom binds the socket to that IP and
	// skips the cache. For the default path (no IP configured) use the pool for
	// connection reuse.
	boundDial := selectedIP != ""
	var conn *pool.Conn
	var connErr error
	requireTLS := msg.TLSPolicy == "require"
	if boundDial {
		conn, connErr = s.pool.DialFrom(domain, selectedIP, requireTLS)
	} else {
		conn, connErr = s.pool.Get(domain, requireTLS)
	}
	if connErr != nil {
		return &Result{
			MessageID:  msg.MessageID,
			Error:      fmt.Sprintf("connect: %v", connErr),
			DurationMs: time.Since(start).Milliseconds(),
		}
	}

	// SMTP envelope — use the VERP Return-Path as MAIL FROM when set so
	// out-of-band bounces come back attributable; else the header From.
	mailFrom := msg.FromEmail
	if msg.ReturnPath != "" {
		mailFrom = msg.ReturnPath
	}
	if err := conn.Client.Mail(mailFrom); err != nil {
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

	// Return the connection for reuse. Source-bound dials (warmup or explicit
	// dedicated IP) are always discarded since they are not tracked in the pool
	// cache; only warmup dials additionally record the warmup counter.
	if boundDial {
		s.pool.Discard(conn)
		// Nothing to record: Claim already spent the unit before dialling.
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

	// Build the content part (the text/html body), capturing its own
	// Content-Type so it can be embedded inside multipart/mixed when there are
	// attachments.
	idSeed := msg.MessageID
	if len(idSeed) < 8 {
		idSeed = idSeed + "00000000"
	}
	boundary := fmt.Sprintf("forgemsg_%s", idSeed[:8])

	var contentType, contentBody string
	if msg.TextBody != "" && msg.HTMLBody != "" {
		contentType = fmt.Sprintf("multipart/alternative; boundary=%q", boundary)
		contentBody = fmt.Sprintf(
			"--%s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n%s\r\n--%s\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n%s\r\n--%s--\r\n",
			boundary, msg.TextBody, boundary, msg.HTMLBody, boundary,
		)
	} else if msg.HTMLBody != "" {
		contentType = "text/html; charset=utf-8"
		contentBody = msg.HTMLBody
	} else {
		contentType = "text/plain; charset=utf-8"
		contentBody = msg.TextBody
	}

	var body string
	if len(msg.Attachments) > 0 {
		// Wrap the content + attachments in multipart/mixed.
		mixed := fmt.Sprintf("forgemsg_mixed_%s", idSeed[:8])
		headers["content-type"] = fmt.Sprintf("multipart/mixed; boundary=%q", mixed)
		var b strings.Builder
		// Part 1: the message body, carrying its own content-type.
		b.WriteString(fmt.Sprintf("--%s\r\nContent-Type: %s\r\n\r\n%s\r\n", mixed, contentType, contentBody))
		// Parts 2..n: attachments, base64-encoded.
		for _, att := range msg.Attachments {
			b.WriteString(buildAttachmentPart(mixed, att))
		}
		b.WriteString(fmt.Sprintf("--%s--\r\n", mixed))
		body = b.String()
	} else {
		headers["content-type"] = contentType
		body = contentBody
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

// buildAttachmentPart renders one multipart/mixed attachment part with
// base64 content wrapped at 76 columns (RFC 2045).
func buildAttachmentPart(boundary string, att Attachment) string {
	ct := att.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}
	disposition := "attachment"
	if att.Inline {
		disposition = "inline"
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	b.WriteString(fmt.Sprintf("Content-Type: %s; name=%q\r\n", ct, att.Filename))
	b.WriteString("Content-Transfer-Encoding: base64\r\n")
	b.WriteString(fmt.Sprintf("Content-Disposition: %s; filename=%q\r\n", disposition, att.Filename))
	if att.ContentID != "" {
		b.WriteString(fmt.Sprintf("Content-ID: <%s>\r\n", att.ContentID))
	}
	b.WriteString("\r\n")
	b.WriteString(wrapBase64(base64.StdEncoding.EncodeToString(att.Content)))
	b.WriteString("\r\n")
	return b.String()
}

// wrapBase64 splits an encoded string into 76-char lines per RFC 2045.
func wrapBase64(s string) string {
	const width = 76
	if len(s) <= width {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i += width {
		end := i + width
		if end > len(s) {
			end = len(s)
		}
		b.WriteString(s[i:end])
		b.WriteString("\r\n")
	}
	return strings.TrimSuffix(b.String(), "\r\n")
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
