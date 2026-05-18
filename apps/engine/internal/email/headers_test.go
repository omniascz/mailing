package email

import "testing"

func TestResolveIsp(t *testing.T) {
	cases := []struct {
		addr string
		want IspType
	}{
		{"petr@seznam.cz", IspSeznam},
		{"anna@EMAIL.CZ", IspSeznam},
		{"x@volny.cz", IspVolny},
		{"x@centrum.cz", IspCentrum},
		{"x@post.cz", IspCentrum},
		{"x@gmail.com", IspGoogle},
		{"x@googlemail.com", IspGoogle},
		{"x@outlook.com", IspMicrosoft},
		{"x@hotmail.com", IspMicrosoft},
		{"x@icloud.com", IspApple},
		{"x@yahoo.co.uk", IspYahoo},
		{"x@unknown.example", IspUnknown},
		{"no-at-sign", IspUnknown},
		{"trailing-at@", IspUnknown},
	}
	for _, c := range cases {
		if got := ResolveIsp(c.addr); got != c.want {
			t.Errorf("ResolveIsp(%q) = %q, want %q", c.addr, got, c.want)
		}
	}
}

func TestApplyIspHeaders_Seznam(t *testing.T) {
	h := map[string]string{}
	isp := ApplyIspHeaders(h, "petr@seznam.cz", IspHeaderOptions{
		CampaignID:       "c-123",
		SendingDomain:    "mail.forgemsg.cz",
		CampaignCategory: "newsletter",
		Stream:           "broadcast",
	})
	if isp != IspSeznam {
		t.Fatalf("expected IspSeznam, got %q", isp)
	}
	if h["precedence"] != "bulk" {
		t.Errorf("Precedence not set: %q", h["precedence"])
	}
	if h["feedback-id"] != "c-123:broadcast:forgemsg:mail.forgemsg.cz" {
		t.Errorf("Feedback-ID mismatch: %q", h["feedback-id"])
	}
	if h["x-seznam-campaign-category"] != "newsletter" {
		t.Errorf("X-Seznam-Campaign-Category not set: %q", h["x-seznam-campaign-category"])
	}
	if h["auto-submitted"] != "auto-generated" {
		t.Errorf("Auto-Submitted not set")
	}
}

func TestApplyIspHeaders_TransactionalSkipsPrecedence(t *testing.T) {
	h := map[string]string{}
	ApplyIspHeaders(h, "petr@seznam.cz", IspHeaderOptions{
		Stream:           "transactional",
		CampaignID:       "c-9",
		SendingDomain:    "mail.forgemsg.cz",
		CampaignCategory: "transactional",
	})
	if _, ok := h["precedence"]; ok {
		t.Errorf("Transactional messages must not carry Precedence; got %q", h["precedence"])
	}
	if h["x-seznam-campaign-category"] != "transactional" {
		t.Errorf("X-Seznam category expected, got %q", h["x-seznam-campaign-category"])
	}
}

func TestApplyIspHeaders_CallerOverrideWins(t *testing.T) {
	h := map[string]string{"precedence": "list"}
	ApplyIspHeaders(h, "x@seznam.cz", IspHeaderOptions{Stream: "broadcast"})
	if h["precedence"] != "list" {
		t.Errorf("caller override should win, got %q", h["precedence"])
	}
}

func TestApplyIspHeaders_NonSeznamSkipsCategory(t *testing.T) {
	h := map[string]string{}
	ApplyIspHeaders(h, "x@gmail.com", IspHeaderOptions{CampaignCategory: "newsletter"})
	if _, ok := h["x-seznam-campaign-category"]; ok {
		t.Errorf("X-Seznam-Campaign-Category should not be set for non-Seznam")
	}
}

func TestApplyIspHeaders_NoCampaignMetadata(t *testing.T) {
	h := map[string]string{}
	ApplyIspHeaders(h, "x@seznam.cz", IspHeaderOptions{Stream: "broadcast"})
	if _, ok := h["feedback-id"]; ok {
		t.Errorf("Feedback-ID requires CampaignID+SendingDomain; should be absent")
	}
}

func TestApplyIspHeaders_NilMap(t *testing.T) {
	isp := ApplyIspHeaders(nil, "x@seznam.cz", IspHeaderOptions{})
	if isp != IspUnknown {
		t.Errorf("nil map guard should return IspUnknown, got %q", isp)
	}
}

func TestRecommendedThrottle(t *testing.T) {
	if got := RecommendedThrottle(IspSeznam); got.MaxConnections == 0 || got.MaxPerHour == 0 {
		t.Errorf("Seznam throttle must have non-zero defaults, got %+v", got)
	}
	if got := RecommendedThrottle(IspUnknown); got.MaxPerHour == 0 {
		t.Errorf("Unknown ISP should still return non-zero fallback")
	}
}
