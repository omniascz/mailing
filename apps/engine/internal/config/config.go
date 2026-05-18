// Package config provides configuration loading for the MTA engine.
package config

import (
	"os"
	"strconv"
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

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}
