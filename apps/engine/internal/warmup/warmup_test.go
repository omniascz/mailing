package warmup

import "testing"

func TestDailyLimit(t *testing.T) {
	cases := []struct {
		day  int
		want int
	}{
		{1, 50},
		{3, 50},
		{4, 200},
		{7, 200},
		{8, 1_000},
		{14, 1_000},
		{15, 5_000},
		{21, 5_000},
		{22, 20_000},
		{30, 20_000},
		{31, -1},
		{99, -1},
	}
	for _, c := range cases {
		got := dailyLimit(c.day)
		if got != c.want {
			t.Errorf("dailyLimit(%d) = %d, want %d", c.day, got, c.want)
		}
	}
}

func TestRedisKeys(t *testing.T) {
	ip := "1.2.3.4"
	if k := warmupDayKey(ip); k != "warmup:1.2.3.4:day" {
		t.Errorf("warmupDayKey = %q", k)
	}
	if k := todaySentKey(ip); k != "warmup:1.2.3.4:today_sent" {
		t.Errorf("todaySentKey = %q", k)
	}
}
