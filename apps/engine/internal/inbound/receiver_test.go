package inbound

import (
	"strings"
	"testing"
)

// F5: the inbound endpoint validates X-Inbound-Secret, so a receiver with no
// secret would have every forward rejected. New must refuse to build one.
func TestNew_refusesWithoutAPISecret(t *testing.T) {
	_, err := New(Config{ListenAddr: ":0"})
	if err == nil {
		t.Fatal("expected New to refuse a receiver with an empty APISecret")
	}
	if !strings.Contains(err.Error(), "INBOUND_EMAIL_SECRET") {
		t.Fatalf("error should name the env var, got: %v", err)
	}
}

func TestNew_succeedsWithAPISecret(t *testing.T) {
	r, err := New(Config{ListenAddr: ":0", APISecret: "s"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r == nil {
		t.Fatal("expected a receiver")
	}
}
