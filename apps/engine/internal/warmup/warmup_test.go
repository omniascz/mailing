package warmup

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The schedule used to be duplicated here, in Go, alongside the copy in
// apps/api/src/services/sending/ip-warmup.ts. Two tables of the same numbers
// is one table too many — the API owns them now and this package only asks.

func TestNew_DisabledWithoutAPIURL(t *testing.T) {
	m, err := New(Config{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if m != nil {
		t.Fatal("expected a nil manager when no API URL is configured")
	}
	// A nil manager must still be safe to use.
	if ip, err := m.Claim(context.Background(), []string{"1.2.3.4"}); ip != "" || err != nil {
		t.Fatalf("nil manager should no-op, got %q %v", ip, err)
	}
}

func TestNew_URLWithoutSecretIsAnError(t *testing.T) {
	// Not a disabled feature: every claim would answer 401 and, without this,
	// the engine would carry on sending from a cold IP with no limit at all.
	if _, err := New(Config{APIURL: "http://api:3001"}); err == nil {
		t.Fatal("expected an error when the secret is missing")
	}
}

func TestClaim_ReturnsTheGrantedIPAndAuthenticates(t *testing.T) {
	var gotSecret, gotPath string
	var gotBody struct {
		IPs []string `json:"ips"`
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSecret = r.Header.Get("X-Internal-Secret")
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"ip":"203.0.113.2","warmupDay":4,"sentToday":7,"dailyLimit":200,"isWarm":false,"known":true}}`))
	}))
	defer srv.Close()

	m, err := New(Config{APIURL: srv.URL, Secret: "s3cret"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	ip, err := m.Claim(context.Background(), []string{"203.0.113.1", "203.0.113.2"})
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if ip != "203.0.113.2" {
		t.Fatalf("expected the IP the API granted, got %q", ip)
	}
	if gotSecret != "s3cret" {
		t.Fatalf("claim must authenticate, got header %q", gotSecret)
	}
	if gotPath != "/api/v1/internal/sending/warmup/claim" {
		t.Fatalf("unexpected path %q", gotPath)
	}
	if len(gotBody.IPs) != 2 {
		t.Fatalf("expected both candidate IPs to be offered, got %v", gotBody.IPs)
	}
}

func TestClaim_ExhaustedIsItsOwnError(t *testing.T) {
	// 429 is not a failure to reach the counter — it is the counter saying no.
	// The workers' send path matches ErrAllExhausted's text to defer the
	// message to midnight instead of failing it.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"code":"WARMUP_QUOTA_EXHAUSTED"}`))
	}))
	defer srv.Close()

	m, _ := New(Config{APIURL: srv.URL, Secret: "s"})
	_, err := m.Claim(context.Background(), []string{"203.0.113.1"})
	if !errors.Is(err, ErrAllExhausted) {
		t.Fatalf("expected ErrAllExhausted, got %v", err)
	}
	if got := ErrAllExhausted.Error(); got != "warmup: all sending IPs have reached their daily limit" {
		t.Fatalf("the workers match on this text; it changed to %q", got)
	}
}

func TestClaim_UnreachableCounterDoesNotAllowTheSend(t *testing.T) {
	// The moment the counter cannot be consulted is exactly when an unbounded
	// send is most likely to be wrong, so this must be an error and not "".
	m, _ := New(Config{APIURL: "http://127.0.0.1:1", Secret: "s"})
	ip, err := m.Claim(context.Background(), []string{"203.0.113.1"})
	if err == nil {
		t.Fatal("expected an error when the API is unreachable")
	}
	if ip != "" {
		t.Fatalf("expected no IP on failure, got %q", ip)
	}
}

func TestClaim_ServerErrorIsNotMistakenForExhaustion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	m, _ := New(Config{APIURL: srv.URL, Secret: "s"})
	_, err := m.Claim(context.Background(), []string{"203.0.113.1"})
	if err == nil {
		t.Fatal("expected an error on 500")
	}
	if errors.Is(err, ErrAllExhausted) {
		t.Fatal("a 500 is a broken counter, not a spent allowance")
	}
}
