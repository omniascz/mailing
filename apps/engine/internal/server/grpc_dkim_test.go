package server

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"strings"
	"testing"

	"github.com/forgemsg/engine/internal/dkim"
	pb "github.com/forgemsg/engine/proto"
)

// A real RSA key in the PKCS#8 PEM shape the API stores and ships, so the
// signing test exercises parsePrivateKey the same way production does.
func generateRSATestKey(t *testing.T) (privPEM string, pub *rsa.PublicKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})), &key.PublicKey
}

// The seam where "the API sent no DKIM fields" becomes "this message has no key".
//
// requestToMessage only populates DkimConfig when req.Dkim is non-nil, and
// Sender.Send signs only when `msg.DkimConfig != nil && PrivateKeyPEM != ""`
// (sender.go). There is no else branch and no default key anywhere in this
// module, so a request that arrives without DKIM is delivered unsigned — no
// error, no log, and a successful Result.
//
// That was the state of every transactional message: DOI confirmations,
// password resets, identity verification and customer order confirmations. The
// API side now resolves a key; these tests pin the engine end of that contract,
// including the failure this fix had to avoid — shipping a domain with no key,
// which arrives here as a config the signer then skips, reaching exactly the
// same unsigned mail by a longer road.

func TestRequestToMessage_NoDkim_LeavesMessageUnsigned(t *testing.T) {
	msg := requestToMessage(&pb.SendRequest{
		MessageId: "<txn-1@forgemsg>",
		FromEmail: "no-reply@ops.test",
		ToEmail:   "subscriber@example.test",
		Subject:   "Confirm your subscription",
		HtmlBody:  "<p>Confirm</p>",
	})

	if msg.DkimConfig != nil {
		t.Fatalf("expected no DkimConfig, got %+v", msg.DkimConfig)
	}
	// This is the condition in Sender.Send. Spelled out here so the reason a
	// nil config means unsigned is visible at the assertion.
	if signs := msg.DkimConfig != nil && msg.DkimConfig.PrivateKeyPEM != ""; signs {
		t.Fatal("a message with no DkimConfig must not take the signing branch")
	}
}

func TestRequestToMessage_CarriesTheKeyMaterialVerbatim(t *testing.T) {
	const (
		domain   = "shop.test"
		selector = "fmk20260101000000"
		pem      = "-----BEGIN PRIVATE KEY-----SHOP-----END PRIVATE KEY-----"
	)

	msg := requestToMessage(&pb.SendRequest{
		MessageId: "<txn-2@forgemsg>",
		FromEmail: "orders@shop.test",
		ToEmail:   "buyer@example.test",
		Subject:   "Your order",
		HtmlBody:  "<p>Thanks</p>",
		Dkim: &pb.DkimConfig{
			Domain:        domain,
			Selector:      selector,
			PrivateKeyPem: pem,
		},
	})

	if msg.DkimConfig == nil {
		t.Fatal("DkimConfig dropped between the request and the message")
	}
	// Verbatim matters: a selector that does not match the key published under
	// that domain produces a signature no receiver can validate, which is a
	// worse outcome than no signature at all.
	if msg.DkimConfig.Domain != domain {
		t.Errorf("domain: got %q want %q", msg.DkimConfig.Domain, domain)
	}
	if msg.DkimConfig.Selector != selector {
		t.Errorf("selector: got %q want %q", msg.DkimConfig.Selector, selector)
	}
	if msg.DkimConfig.PrivateKeyPEM != pem {
		t.Errorf("private key: got %q want %q", msg.DkimConfig.PrivateKeyPEM, pem)
	}
}

// The signature carries the domain and selector it was given — the pairing a
// receiver uses to fetch the public half from <selector>._domainkey.<domain>.
// A key resolved for the wrong domain fails there, silently, at the receiver.
func TestSignedHeaderNamesTheDomainAndSelectorWeSupplied(t *testing.T) {
	const (
		domain   = "shop.test"
		selector = "fmk20260101000000"
	)
	priv, _ := generateRSATestKey(t)

	msg := requestToMessage(&pb.SendRequest{
		MessageId: "<txn-3@forgemsg>",
		FromEmail: "orders@shop.test",
		ToEmail:   "buyer@example.test",
		Subject:   "Your order",
		HtmlBody:  "<p>Thanks</p>",
		Dkim:      &pb.DkimConfig{Domain: domain, Selector: selector, PrivateKeyPem: priv},
	})

	sig, err := dkim.Sign(*msg.DkimConfig, map[string]string{
		"from":       "orders@shop.test",
		"to":         "buyer@example.test",
		"subject":    "Your order",
		"message-id": "<txn-3@forgemsg>",
	}, "<p>Thanks</p>")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if !strings.Contains(sig, "d="+domain+";") {
		t.Errorf("signature does not name our domain: %s", sig)
	}
	if !strings.Contains(sig, "s="+selector+";") {
		t.Errorf("signature does not name our selector: %s", sig)
	}
}
