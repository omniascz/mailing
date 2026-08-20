// Package inbound implements an MX-side SMTP receiver. Incoming mail is parsed
// (RFC 5322 headers, text/HTML body, attachments) and then POSTed to the API
// at /api/v1/webhooks/inbound-email/raw, where it's persisted, matched to a
// contact, and routed to helpdesk or workflow triggers.
//
// Authentication between the engine and the API uses a shared secret in the
// X-Inbound-Secret header. Attachments are streamed inline as base64 (good
// enough for typical reply sizes; switch to S3 pre-upload for larger payloads).
package inbound

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"net/mail"
	"net/textproto"
	"strings"
	"time"
)

type Config struct {
	// Listen address, e.g. ":2525" — port 25 typically requires root.
	ListenAddr string
	// Hostname advertised in SMTP banners.
	Hostname string
	// API endpoint that accepts the parsed payload.
	APIURL string
	// Shared secret sent in X-Inbound-Secret header.
	APISecret string
	// Max message size in bytes (default 30 MiB).
	MaxSize int64
}

type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	// Base64-encoded inline payload. The API can move this to object storage.
	DataB64 string `json:"dataB64"`
}

type Payload struct {
	OrgID       string            `json:"orgId,omitempty"`
	From        string            `json:"from"`
	To          string            `json:"to"`
	Subject     string            `json:"subject,omitempty"`
	TextBody    string            `json:"textBody,omitempty"`
	HTMLBody    string            `json:"htmlBody,omitempty"`
	MessageID   string            `json:"messageId,omitempty"`
	InReplyTo   string            `json:"inReplyTo,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Attachments []Attachment      `json:"attachments,omitempty"`
	ReceivedAt  time.Time         `json:"receivedAt"`
}

type Receiver struct {
	cfg Config
}

func New(cfg Config) (*Receiver, error) {
	if cfg.MaxSize == 0 {
		cfg.MaxSize = 30 * 1024 * 1024
	}
	if cfg.Hostname == "" {
		cfg.Hostname = "mx.forgemsg.local"
	}
	// The inbound endpoint on the API validates X-Inbound-Secret; without a
	// secret every forwarded message is rejected. Refuse to start rather than
	// silently drop all inbound mail.
	if cfg.APISecret == "" {
		return nil, fmt.Errorf(
			"inbound: APISecret is empty — forwarded messages would be rejected by the API. " +
				"Set INBOUND_EMAIL_SECRET (same value the API uses)",
		)
	}
	return &Receiver{cfg: cfg}, nil
}

// ListenAndServe runs a minimal SMTP listener (LHLO/MAIL/RCPT/DATA only).
// This is intentionally tiny — we expect a real MX in front (Postfix/Haraka)
// to handle TLS, spam, DKIM verification. This is the catch-all backend.
func (r *Receiver) ListenAndServe() error {
	ln, err := net.Listen("tcp", r.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", r.cfg.ListenAddr, err)
	}
	log.Printf("inbound: SMTP receiver listening on %s", r.cfg.ListenAddr)
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("inbound: accept: %v", err)
			continue
		}
		go r.handleConn(conn)
	}
}

func (r *Receiver) handleConn(c net.Conn) {
	defer c.Close()
	c.SetDeadline(time.Now().Add(2 * time.Minute))
	tp := textproto.NewConn(c)
	defer tp.Close()
	if err := tp.PrintfLine("220 %s ESMTP forgemsg-inbound", r.cfg.Hostname); err != nil {
		return
	}
	var from, to string
	for {
		line, err := tp.ReadLine()
		if err != nil {
			return
		}
		upper := strings.ToUpper(line)
		switch {
		case strings.HasPrefix(upper, "HELO"), strings.HasPrefix(upper, "EHLO"):
			tp.PrintfLine("250 %s", r.cfg.Hostname)
		case strings.HasPrefix(upper, "MAIL FROM:"):
			from = extractAddr(line[10:])
			tp.PrintfLine("250 OK")
		case strings.HasPrefix(upper, "RCPT TO:"):
			to = extractAddr(line[8:])
			tp.PrintfLine("250 OK")
		case upper == "DATA":
			tp.PrintfLine("354 End data with <CR><LF>.<CR><LF>")
			body, err := tp.ReadDotBytes()
			if err != nil {
				tp.PrintfLine("451 read error")
				return
			}
			if int64(len(body)) > r.cfg.MaxSize {
				tp.PrintfLine("552 message too large")
				continue
			}
			if err := r.dispatch(from, to, body); err != nil {
				log.Printf("inbound: dispatch: %v", err)
				tp.PrintfLine("451 try again later")
				continue
			}
			tp.PrintfLine("250 accepted")
			from, to = "", ""
		case upper == "QUIT":
			tp.PrintfLine("221 bye")
			return
		case upper == "RSET":
			from, to = "", ""
			tp.PrintfLine("250 OK")
		case upper == "NOOP":
			tp.PrintfLine("250 OK")
		default:
			tp.PrintfLine("502 unrecognised")
		}
	}
}

func extractAddr(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "<"); i >= 0 {
		if j := strings.Index(s[i:], ">"); j > 0 {
			return s[i+1 : i+j]
		}
	}
	return s
}

// ParseRFC5322 turns raw bytes into a Payload by walking MIME parts.
func ParseRFC5322(raw []byte) (*Payload, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	p := &Payload{
		From:       firstAddress(msg.Header.Get("From")),
		To:         firstAddress(msg.Header.Get("To")),
		Subject:    decodeHeader(msg.Header.Get("Subject")),
		MessageID:  strings.Trim(msg.Header.Get("Message-ID"), "<>"),
		InReplyTo:  strings.Trim(msg.Header.Get("In-Reply-To"), "<>"),
		Headers:    flatHeaders(msg.Header),
		ReceivedAt: time.Now().UTC(),
	}
	ct := msg.Header.Get("Content-Type")
	mediaType, params, _ := mime.ParseMediaType(ct)
	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(msg.Body, params["boundary"])
		if err := walkParts(mr, p); err != nil {
			return nil, err
		}
	} else {
		body, _ := io.ReadAll(msg.Body)
		assignBody(p, mediaType, body)
	}
	return p, nil
}

func walkParts(mr *multipart.Reader, p *Payload) error {
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		ct := part.Header.Get("Content-Type")
		mediaType, params, _ := mime.ParseMediaType(ct)
		body, _ := io.ReadAll(part)
		if strings.HasPrefix(mediaType, "multipart/") {
			sub := multipart.NewReader(bytes.NewReader(body), params["boundary"])
			if err := walkParts(sub, p); err != nil {
				return err
			}
			continue
		}
		filename := part.FileName()
		if filename != "" {
			p.Attachments = append(p.Attachments, Attachment{
				Filename:    filename,
				ContentType: mediaType,
				Size:        len(body),
				DataB64:     base64.StdEncoding.EncodeToString(body),
			})
			continue
		}
		assignBody(p, mediaType, body)
	}
}

func assignBody(p *Payload, mediaType string, body []byte) {
	switch mediaType {
	case "text/plain":
		if p.TextBody == "" {
			p.TextBody = string(body)
		}
	case "text/html":
		if p.HTMLBody == "" {
			p.HTMLBody = string(body)
		}
	}
}

func firstAddress(h string) string {
	if h == "" {
		return ""
	}
	addr, err := mail.ParseAddress(h)
	if err != nil {
		return strings.TrimSpace(h)
	}
	return addr.Address
}

func decodeHeader(h string) string {
	dec := new(mime.WordDecoder)
	out, err := dec.DecodeHeader(h)
	if err != nil {
		return h
	}
	return out
}

func flatHeaders(hs mail.Header) map[string]string {
	out := make(map[string]string, len(hs))
	for k, vv := range hs {
		if len(vv) > 0 {
			out[k] = vv[0]
		}
	}
	return out
}

// dispatch parses the raw bytes and POSTs the resulting Payload to the API.
func (r *Receiver) dispatch(envFrom, envTo string, raw []byte) error {
	p, err := ParseRFC5322(raw)
	if err != nil {
		return err
	}
	if p.From == "" {
		p.From = envFrom
	}
	if p.To == "" {
		p.To = envTo
	}
	body, err := json.Marshal(p)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", r.cfg.APIURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	// Always sent — the inbound endpoint requires it. New() guarantees non-empty.
	req.Header.Set("X-Inbound-Secret", r.cfg.APISecret)
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("api status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}
