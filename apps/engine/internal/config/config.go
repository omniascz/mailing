// Package config provides configuration loading for the MTA engine.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all MTA configuration.
type Config struct {
	// gRPC server address
	GRPCAddr string

	// SMTP settings
	SMTPConnectTimeout time.Duration
	SMTPReadTimeout    time.Duration
	SMTPWriteTimeout   time.Duration

	// Connection pool
	PoolMaxConnsPerDomain int
	PoolIdleTimeout       time.Duration

	// TLS
	TLSPreferred bool // prefer STARTTLS if available

	// Metrics / logging
	LogLevel string

	// Redis (used for IP warmup enforcement)
	// Empty = warmup disabled.
	RedisURL string

	// SendingIPs is an optional comma-separated list of local IP addresses
	// the engine can bind to when dialling outbound SMTP connections.
	// When set, the warmup manager selects the best IP per send.
	// Example: "1.2.3.4,1.2.3.5"
	SendingIPs []string

	// WarmupAPIURL is the API base the engine asks for warmup capacity.
	// Empty disables enforcement; set together with SENDING_IPS or the engine
	// refuses to boot (see main.go).
	WarmupAPIURL string

	// InternalAPISecret authenticates the warmup claim, same header and same
	// value the submission server already uses for /internal/smtp/auth.
	InternalAPISecret string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		GRPCAddr:              envOrDefault("GRPC_ADDR", "0.0.0.0:50051"),
		SMTPConnectTimeout:    envDuration("SMTP_CONNECT_TIMEOUT", 30*time.Second),
		SMTPReadTimeout:       envDuration("SMTP_READ_TIMEOUT", 60*time.Second),
		SMTPWriteTimeout:      envDuration("SMTP_WRITE_TIMEOUT", 60*time.Second),
		PoolMaxConnsPerDomain: envInt("POOL_MAX_CONNS_PER_DOMAIN", 10),
		PoolIdleTimeout:       envDuration("POOL_IDLE_TIMEOUT", 5*time.Minute),
		TLSPreferred:          envBool("TLS_PREFERRED", true),
		LogLevel:              envOrDefault("LOG_LEVEL", "info"),
		RedisURL:              envOrDefault("REDIS_URL", ""),
		SendingIPs:            envStringSlice("SENDING_IPS"),
		WarmupAPIURL:          envOrDefault("WARMUP_API_URL", os.Getenv("API_URL")),
		InternalAPISecret:     os.Getenv("INTERNAL_API_SECRET"),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func envStringSlice(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return nil
	}
	var out []string
	for _, s := range strings.Split(v, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}
