// Package dkim provides DKIM signing for outgoing email messages.
//
// Implements relaxed/relaxed canonicalization with RSA-SHA256.
package dkim

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"time"
)

// SignConfig holds per-message DKIM configuration.
type SignConfig struct {
	Domain        string
	Selector      string
	PrivateKeyPEM string
}

// SignedHeaders are the headers we include in the DKIM signature.
var SignedHeaders = []string{
	"from", "to", "subject", "date", "message-id",
	"mime-version", "content-type",
	"list-unsubscribe", "list-unsubscribe-post",
}

// Sign produces a DKIM-Signature header value for the given headers and body.
//
// The returned string should be prepended to the email as:
//
//	DKIM-Signature: <value>
func Sign(cfg SignConfig, headers map[string]string, body string) (string, error) {
	privKey, err := parsePrivateKey(cfg.PrivateKeyPEM)
	if err != nil {
		return "", fmt.Errorf("dkim: parse private key: %w", err)
	}

	// Relaxed body canonicalization
	canonBody := canonicalizeBody(body)
	bodyHash := sha256Hash(canonBody)
	bodyHashB64 := base64.StdEncoding.EncodeToString(bodyHash)

	// Build list of headers that are present in the message
	var presentHeaders []string
	for _, h := range SignedHeaders {
		if _, ok := headers[h]; ok {
			presentHeaders = append(presentHeaders, h)
		}
	}

	timestamp := time.Now().Unix()

	// Build partial DKIM-Signature (no b= value yet)
	partialSig := fmt.Sprintf(
		"v=1; a=rsa-sha256; c=relaxed/relaxed; d=%s; s=%s; t=%d; bh=%s; h=%s;",
		cfg.Domain, cfg.Selector, timestamp, bodyHashB64,
		strings.Join(presentHeaders, ":"),
	)

	// Relaxed header canonicalization for signing
	var canonHeaders []string
	for _, name := range presentHeaders {
		value := headers[name]
		canonHeaders = append(canonHeaders, canonicalizeHeader(name, value))
	}
	// Append the DKIM-Signature header itself (with empty b=)
	canonHeaders = append(canonHeaders, canonicalizeHeader("dkim-signature", partialSig+" b="))

	dataToSign := strings.Join(canonHeaders, "\r\n")

	hash := sha256.Sum256([]byte(dataToSign))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", fmt.Errorf("dkim: sign: %w", err)
	}

	sigB64 := base64.StdEncoding.EncodeToString(signature)

	return fmt.Sprintf("%s b=%s", partialSig, sigB64), nil
}

// canonicalizeBody implements relaxed body canonicalization per RFC 6376 §3.4.4.
func canonicalizeBody(body string) string {
	// Normalise line endings to CRLF
	s := strings.ReplaceAll(body, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\n", "\r\n")

	// Replace sequences of WSP with a single space
	lines := strings.Split(s, "\r\n")
	for i, line := range lines {
		// Collapse whitespace within the line
		var b strings.Builder
		prevSpace := false
		for _, ch := range line {
			if ch == ' ' || ch == '\t' {
				if !prevSpace {
					b.WriteByte(' ')
					prevSpace = true
				}
			} else {
				b.WriteRune(ch)
				prevSpace = false
			}
		}
		// Trim trailing whitespace
		lines[i] = strings.TrimRight(b.String(), " ")
	}

	result := strings.Join(lines, "\r\n")

	// Remove empty lines at the end of the body
	result = strings.TrimRight(result, "\r\n")
	// Ensure exactly one trailing CRLF
	result += "\r\n"

	return result
}

// canonicalizeHeader implements relaxed header canonicalization per RFC 6376 §3.4.2.
func canonicalizeHeader(name, value string) string {
	// Lowercase header name
	lowerName := strings.ToLower(name)
	// Unfold header value (remove CRLF, collapse WSP)
	val := strings.ReplaceAll(value, "\r\n", "")
	val = strings.ReplaceAll(val, "\n", "")
	// Collapse whitespace
	var b strings.Builder
	prevSpace := false
	for _, ch := range strings.TrimSpace(val) {
		if ch == ' ' || ch == '\t' {
			if !prevSpace {
				b.WriteByte(' ')
				prevSpace = true
			}
		} else {
			b.WriteRune(ch)
			prevSpace = false
		}
	}

	return lowerName + ":" + b.String()
}

func sha256Hash(data string) []byte {
	h := sha256.Sum256([]byte(data))
	return h[:]
}

func parsePrivateKey(pemData string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("no PEM block found")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// Fall back to PKCS1
		k, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("parse key: pkcs8=%w, pkcs1=%w", err, err2)
		}
		return k, nil
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA")
	}
	return rsaKey, nil
}
