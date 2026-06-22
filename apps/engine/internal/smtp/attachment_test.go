package smtp

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestBuildRawMessage_NoAttachments_HTMLOnly(t *testing.T) {
	raw, headers, _ := buildRawMessage(&Message{
		MessageID: "abcdef1234",
		FromEmail: "no-reply@tixly.cz",
		ToEmail:   "buyer@example.com",
		Subject:   "Your tickets",
		HTMLBody:  "<p>Hello</p>",
	})
	if got := headers["content-type"]; got != "text/html; charset=utf-8" {
		t.Fatalf("expected plain html content-type, got %q", got)
	}
	if strings.Contains(raw, "multipart/mixed") {
		t.Fatal("no-attachment email must not be multipart/mixed")
	}
}

func TestBuildRawMessage_WithPDFAttachment(t *testing.T) {
	pdf := []byte("%PDF-1.7 fake ticket bytes")
	raw, headers, _ := buildRawMessage(&Message{
		MessageID: "order9999",
		FromEmail: "no-reply@tixly.cz",
		FromName:  "Tixly",
		ToEmail:   "buyer@example.com",
		Subject:   "Your e-ticket",
		HTMLBody:  "<p>Ticket attached</p>",
		TextBody:  "Ticket attached",
		Attachments: []Attachment{
			{Filename: "ticket.pdf", ContentType: "application/pdf", Content: pdf},
		},
	})

	// Top-level must be multipart/mixed.
	if ct := headers["content-type"]; !strings.HasPrefix(ct, "multipart/mixed;") {
		t.Fatalf("expected multipart/mixed, got %q", ct)
	}
	// The body (alternative) must be nested as the first part.
	if !strings.Contains(raw, "multipart/alternative;") {
		t.Fatal("expected nested multipart/alternative content part")
	}
	// Attachment headers.
	for _, want := range []string{
		`Content-Type: application/pdf; name="ticket.pdf"`,
		"Content-Transfer-Encoding: base64",
		`Content-Disposition: attachment; filename="ticket.pdf"`,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("missing attachment header %q", want)
		}
	}
	// The base64 payload must be present and decode back to the original bytes.
	enc := base64.StdEncoding.EncodeToString(pdf)
	if !strings.Contains(raw, enc) {
		t.Fatalf("base64 payload not found in message")
	}
}

func TestBuildRawMessage_InlineAttachmentWithCID(t *testing.T) {
	raw, _, _ := buildRawMessage(&Message{
		MessageID: "msg12345",
		FromEmail: "a@b.cz",
		ToEmail:   "c@d.cz",
		Subject:   "x",
		HTMLBody:  `<img src="cid:logo">`,
		Attachments: []Attachment{
			{Filename: "logo.png", ContentType: "image/png", Content: []byte("PNG"), ContentID: "logo", Inline: true},
		},
	})
	if !strings.Contains(raw, "Content-ID: <logo>") {
		t.Fatal("expected Content-ID header for inline attachment")
	}
	if !strings.Contains(raw, "Content-Disposition: inline; filename=\"logo.png\"") {
		t.Fatal("expected inline disposition")
	}
}

func TestWrapBase64(t *testing.T) {
	long := strings.Repeat("A", 200)
	wrapped := wrapBase64(long)
	for _, line := range strings.Split(wrapped, "\r\n") {
		if len(line) > 76 {
			t.Fatalf("line exceeds 76 cols: %d", len(line))
		}
	}
	if strings.ReplaceAll(wrapped, "\r\n", "") != long {
		t.Fatal("wrapping must be lossless")
	}
}
