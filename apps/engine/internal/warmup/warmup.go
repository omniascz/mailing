// Package warmup enforces per-IP daily send limits during the IP warm-up period.
//
// Redis key schema (matches TypeScript apps/api/src/services/sending/ip-warmup.ts):
//
//	warmup:{ip}:day        — current warmup day (int, set by the TS daily cron)
//	warmup:{ip}:today_sent — emails sent today from this IP (INCR, TTL = midnight UTC)
//
// The Go engine reads these keys to decide which IP to use and increments
// today_sent after every successful delivery.
package warmup

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Warmup schedule — mirrors WARMUP_SCHEDULE in apps/api/src/services/sending/ip-warmup.ts.
func dailyLimit(warmupDay int) int {
	switch {
	case warmupDay <= 3:
		return 50
	case warmupDay <= 7:
		return 200
	case warmupDay <= 14:
		return 1_000
	case warmupDay <= 21:
		return 5_000
	case warmupDay <= 30:
		return 20_000
	default:
		return -1 // warm — unlimited
	}
}

const warmupCompleteDay = 31

func warmupDayKey(ip string) string  { return "warmup:" + ip + ":day" }
func todaySentKey(ip string) string  { return "warmup:" + ip + ":today_sent" }

// IPStatus is the runtime state of a single sending IP.
type IPStatus struct {
	IP         string
	WarmupDay  int
	DailyLimit int
	SentToday  int
	Remaining  int  // -1 = unlimited (warm)
	IsWarm     bool
}

// Manager reads and updates IP warmup state from Redis.
type Manager struct {
	rdb *redis.Client
}

// New creates a Manager connected to the given Redis URL.
// Returns nil, nil when redisURL is empty (warmup disabled).
func New(redisURL string) (*Manager, error) {
	if redisURL == "" {
		return nil, nil
	}
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("warmup: parse redis url: %w", err)
	}
	return &Manager{rdb: redis.NewClient(opt)}, nil
}

// Close releases the Redis connection.
func (m *Manager) Close() error {
	if m == nil {
		return nil
	}
	return m.rdb.Close()
}

// ipStatus returns the current warmup state for one IP.
func (m *Manager) ipStatus(ctx context.Context, ip string) IPStatus {
	dayRaw, _ := m.rdb.Get(ctx, warmupDayKey(ip)).Result()
	warmupDay, _ := strconv.Atoi(dayRaw)
	if warmupDay == 0 {
		warmupDay = 1
	}

	sentRaw, _ := m.rdb.Get(ctx, todaySentKey(ip)).Result()
	sentToday, _ := strconv.Atoi(sentRaw)

	limit := dailyLimit(warmupDay)
	isWarm := warmupDay >= warmupCompleteDay

	remaining := 0
	if isWarm {
		remaining = -1
	} else if limit-sentToday > 0 {
		remaining = limit - sentToday
	}

	return IPStatus{
		IP:         ip,
		WarmupDay:  warmupDay,
		DailyLimit: limit,
		SentToday:  sentToday,
		Remaining:  remaining,
		IsWarm:     isWarm,
	}
}

// SelectIP picks the best sending IP from the given list.
//
// Selection rules:
//  1. Warm IPs (day ≥ 31) are always preferred — first warm IP wins.
//  2. Among warming IPs, pick the one with the most remaining capacity.
//  3. If all warming IPs are exhausted, return ("", ErrAllExhausted).
//
// Returns ("", nil) when ips is empty (warmup not configured).
func (m *Manager) SelectIP(ctx context.Context, ips []string) (string, error) {
	if m == nil || len(ips) == 0 {
		return "", nil
	}

	statuses := make([]IPStatus, len(ips))
	for i, ip := range ips {
		statuses[i] = m.ipStatus(ctx, ip)
	}

	// Prefer fully warm IPs
	for _, st := range statuses {
		if st.IsWarm {
			return st.IP, nil
		}
	}

	// Warming IPs — pick best remaining capacity
	var best *IPStatus
	for i := range statuses {
		st := &statuses[i]
		if st.Remaining > 0 && (best == nil || st.Remaining > best.Remaining) {
			best = st
		}
	}
	if best == nil {
		return "", ErrAllExhausted
	}
	return best.IP, nil
}

// ErrAllExhausted is returned when every configured IP has hit its daily cap.
var ErrAllExhausted = fmt.Errorf("warmup: all sending IPs have reached their daily limit")

// RecordSend atomically increments today_sent for the given IP.
// TTL is set to end-of-day UTC + 60 s buffer so the key auto-expires.
// Must be called AFTER a successful SMTP delivery.
func (m *Manager) RecordSend(ctx context.Context, ip string) error {
	if m == nil || ip == "" {
		return nil
	}
	key := todaySentKey(ip)

	// Seconds until midnight UTC
	now := time.Now().UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	ttl := time.Until(midnight) + 60*time.Second

	pipe := m.rdb.Pipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)
	_, err := pipe.Exec(ctx)
	return err
}
