package inbound

import (
	"strings"
	"testing"
)

// Z141: a DSN is multipart/report with a message/delivery-status part. The
// parser kept only text/plain and text/html, so the per-recipient fields
// (Final-Recipient, Action, Status, Diagnostic-Code) never reached the API and
// bounces were classified from the human-readable text.

const dsnMessage = "From: MAILER-DAEMON@mx.example\r\n" +
	"To: bounce+abc=forgemsg@bounce.example\r\n" +
	"Subject: Undelivered Mail Returned to Sender\r\n" +
	"MIME-Version: 1.0\r\n" +
	"Content-Type: multipart/report; report-type=delivery-status; boundary=\"b1\"\r\n" +
	"\r\n" +
	"--b1\r\n" +
	"Content-Type: text/plain\r\n" +
	"\r\n" +
	"Delivery to a@example.test has been delayed; earlier: 550 5.1.1 user unknown\r\n" +
	"--b1\r\n" +
	"Content-Type: message/delivery-status\r\n" +
	"\r\n" +
	"Reporting-MTA: dns; mx.example\r\n" +
	"\r\n" +
	"Final-Recipient: rfc822; a@example.test\r\n" +
	"Action: delayed\r\n" +
	"Status: 4.4.7\r\n" +
	"\r\n" +
	"--b1\r\n" +
	"Content-Type: text/rfc822-headers\r\n" +
	"\r\n" +
	"Message-ID: <abc@forgemsg>\r\n" +
	"\r\n" +
	"--b1--\r\n"

func TestParseRFC5322_keepsDeliveryStatus(t *testing.T) {
	p, err := ParseRFC5322([]byte(dsnMessage))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.DeliveryStatus, "Action: delayed") ||
		!strings.Contains(p.DeliveryStatus, "Final-Recipient: rfc822; a@example.test") {
		t.Fatalf("delivery-status part not kept: %q", p.DeliveryStatus)
	}
	if strings.Contains(p.TextBody, "Action:") {
		t.Fatalf("the fields must not be mixed into the text body: %q", p.TextBody)
	}
	if !strings.Contains(p.TextBody, "has been delayed") {
		t.Fatalf("human-readable part lost: %q", p.TextBody)
	}
}

func TestParseRFC5322_deliveryStatusWithAFilenameIsNotAnAttachment(t *testing.T) {
	msg := strings.Replace(dsnMessage,
		"Content-Type: message/delivery-status\r\n",
		"Content-Type: message/delivery-status\r\nContent-Disposition: attachment; filename=\"details.txt\"\r\n", 1)
	p, err := ParseRFC5322([]byte(msg))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.DeliveryStatus, "Status: 4.4.7") {
		t.Fatalf("delivery-status part not kept: %q", p.DeliveryStatus)
	}
	for _, a := range p.Attachments {
		if a.ContentType == "message/delivery-status" {
			t.Fatalf("delivery-status stored as an attachment")
		}
	}
}

func TestParseRFC5322_plainMessageHasNoDeliveryStatus(t *testing.T) {
	p, err := ParseRFC5322([]byte("From: a@b\r\nTo: c@d\r\nSubject: hi\r\nContent-Type: text/plain\r\n\r\nhello\r\n"))
	if err != nil {
		t.Fatal(err)
	}
	if p.DeliveryStatus != "" {
		t.Fatalf("unexpected delivery status %q", p.DeliveryStatus)
	}
}
