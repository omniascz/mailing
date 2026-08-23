// Package warmup enforces per-IP daily send limits during the IP warm-up period.
//
// The engine does not hold the counter. It asks the API to claim one send's
// worth of a sending IP's daily allowance, and the API decides — check and
// increment in a single SQL statement against warmup_ips.today_sent.
//
// It used to keep its own counter in Redis under warmup:{ip}:today_sent while
// the API kept another under warmup:{ip}:sent:{date}. Neither enforcement path
// was ever switched on, which is the only reason that never mattered: had both
// run, each would have counted into its own key and the real daily cap would
// have been twice the configured one. Redis also runs with
// --maxmemory-policy allkeys-lru in both compose files, so the key was
// evictable and losing it would silently restore full capacity to a cold IP.
//
// One counter, in Postgres, reached over the same authenticated internal API
// the engine already uses for /internal/smtp/auth.
package warmup

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ErrAllExhausted is returned when every configured IP has hit its daily cap.
// The workers' send path matches on this text to defer the message to midnight
// rather than failing it — see apps/workers/src/jobs/mta-sender.ts.
var ErrAllExhausted = fmt.Errorf("warmup: all sending IPs have reached their daily limit")

// Manager claims warmup capacity from the API.
type Manager struct {
	apiURL string
	secret string
	client *http.Client
}

// Config is what the manager needs to reach the API.
type Config struct {
	APIURL string // base URL, e.g. http://api:3001
	Secret string // INTERNAL_API_SECRET
}

// New creates a Manager. Returns nil when apiURL is empty (warmup disabled);
// an apiURL without a secret is a configuration error, not a disabled feature,
// because the claim endpoint would answer 401 for every send.
func New(cfg Config) (*Manager, error) {
	if cfg.APIURL == "" {
		return nil, nil
	}
	if cfg.Secret == "" {
		return nil, fmt.Errorf("warmup: API URL is set but INTERNAL_API_SECRET is empty")
	}
	return &Manager{
		apiURL: cfg.APIURL,
		secret: cfg.Secret,
		client: &http.Client{Timeout: 5 * time.Second},
	}, nil
}

// Close exists so callers can defer it regardless of configuration.
func (m *Manager) Close() error { return nil }

type claimResponse struct {
	Data struct {
		IP         string `json:"ip"`
		WarmupDay  int    `json:"warmupDay"`
		SentToday  int    `json:"sentToday"`
		DailyLimit *int   `json:"dailyLimit"`
		IsWarm     bool   `json:"isWarm"`
		Known      bool   `json:"known"`
	} `json:"data"`
}

// Claim picks a sending IP that still has daily allowance and spends one unit
// of it. Selection and the decrement happen together on the API side, so two
// concurrent sends cannot both take the last one.
//
// Returns ErrAllExhausted when every IP is out for today. A transport failure
// is returned as-is and the caller decides; it does NOT silently allow the
// send, because "the counter is unreachable" is exactly when an unbounded
// send is most likely to be the wrong thing.
func (m *Manager) Claim(ctx context.Context, ips []string) (string, error) {
	if m == nil || len(ips) == 0 {
		return "", nil
	}

	body, err := json.Marshal(map[string]any{"ips": ips})
	if err != nil {
		return "", fmt.Errorf("warmup: encode claim: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx, "POST", m.apiURL+"/api/v1/internal/sending/warmup/claim", bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("warmup: build claim: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", m.secret)

	resp, err := m.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("warmup: claim request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return "", ErrAllExhausted
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("warmup: claim returned %d", resp.StatusCode)
	}

	var parsed claimResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("warmup: decode claim: %w", err)
	}
	if parsed.Data.IP == "" {
		return "", fmt.Errorf("warmup: claim returned no IP")
	}
	return parsed.Data.IP, nil
}
