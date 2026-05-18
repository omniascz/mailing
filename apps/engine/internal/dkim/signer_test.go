package dkim

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"strings"
	"testing"
)

func generateTestKeyPair(t *testing.T) (string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	privBytes, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal private key: %v", err)
	}

	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privBytes,
	})

	pubBytes, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}

	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	})

	return string(privPEM), string(pubPEM)
}

func TestSign(t *testing.T) {
	privPEM, _ := generateTestKeyPair(t)

	cfg := SignConfig{
		Domain:        "example.com",
		Selector:      "fm1",
		PrivateKeyPEM: privPEM,
	}

	headers := map[string]string{
		"from":         "sender@example.com",
		"to":           "recipient@test.com",
		"subject":      "Test Email",
		"date":         "Mon, 01 Jan 2024 12:00:00 +0000",
		"message-id":   "<test-123@example.com>",
		"mime-version": "1.0",
		"content-type": "text/html; charset=utf-8",
	}

	body := "<html><body>Hello World</body></html>"

	sig, err := Sign(cfg, headers, body)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	// Verify signature format
	if !strings.HasPrefix(sig, "v=1; a=rsa-sha256; c=relaxed/relaxed;") {
		t.Errorf("unexpected signature prefix: %s", sig[:50])
	}

	if !strings.Contains(sig, "d=example.com") {
		t.Error("signature missing domain")
	}

	if !strings.Contains(sig, "s=fm1") {
		t.Error("signature missing selector")
	}

	if !strings.Contains(sig, "bh=") {
		t.Error("signature missing body hash")
	}

	if !strings.Contains(sig, " b=") {
		t.Error("signature missing signature value")
	}
}

func TestCanonicalizeBody(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "trailing whitespace removed",
			input: "hello  \r\nworld  \r\n",
			want:  "hello\r\nworld\r\n",
		},
		{
			name:  "empty trailing lines removed",
			input: "hello\r\n\r\n\r\n",
			want:  "hello\r\n",
		},
		{
			name:  "tabs converted to spaces",
			input: "hello\tworld\r\n",
			want:  "hello world\r\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canonicalizeBody(tt.input)
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCanonicalizeHeader(t *testing.T) {
	tests := []struct {
		name, hName, hValue, want string
	}{
		{
			name:   "lowercase",
			hName:  "From",
			hValue: "test@example.com",
			want:   "from:test@example.com",
		},
		{
			name:   "collapse whitespace",
			hName:  "Subject",
			hValue: "  Hello   World  ",
			want:   "subject:Hello World",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canonicalizeHeader(tt.hName, tt.hValue)
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParsePrivateKey_PKCS8(t *testing.T) {
	privPEM, _ := generateTestKeyPair(t)
	key, err := parsePrivateKey(privPEM)
	if err != nil {
		t.Fatalf("parsePrivateKey: %v", err)
	}
	if key == nil {
		t.Fatal("expected non-nil key")
	}
}

func TestParsePrivateKey_Invalid(t *testing.T) {
	_, err := parsePrivateKey("not a pem")
	if err == nil {
		t.Fatal("expected error for invalid PEM")
	}
}
