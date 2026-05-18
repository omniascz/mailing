// Package email provides outgoing-email header helpers, including ISP-specific
// deliverability hints for the Czech market (#387).
//
// The entry point is ApplyIspHeaders which, given the recipient address and
// optional campaign metadata, enriches the headers map with ISP-appropriate
// values so the MTA side ((*smtp.Message).Headers) can pick them up.
//
// Supported ISPs:
//
//	seznam      — seznam.cz, email.cz (Seznam.cz Mail; ~20% CZ inbox share)
//	volny       — volny.cz
//	centrum     — centrum.cz, post.cz
//	google      — gmail.com, googlemail.com
//	microsoft   — outlook.com, hotmail.com, live.com, msn.com
//	apple       — icloud.com, me.com, mac.com
//	yahoo       — yahoo.*
//	unknown     — everything else
//
// For CZ ISPs we set Precedence: bulk, List-Unsubscribe-Post per RFC 8058
// (already set upstream) plus a Feedback-ID so ISPs can bucket complaint
// metrics correctly. For Seznam specifically we also set the documented
// X-Seznam-Campaign-Category header when a CampaignCategory is provided.
package email

import (
	"fmt"
	"strings"
)

// IspType identifies a recipient's mailbox provider for routing decisions.
type IspType string

const (
	IspSeznam    IspType = "seznam"
	IspVolny     IspType = "volny"
	IspCentrum   IspType = "centrum"
	IspGoogle    IspType = "google"
	IspMicrosoft IspType = "microsoft"
	IspApple     IspType = "apple"
	IspYahoo     IspType = "yahoo"
	IspUnknown   IspType = "unknown"
)

// IspHeaderOptions carries the per-send context ApplyIspHeaders needs to build
// deliverability hints. All fields are optional; missing values simply skip
// the related header.
type IspHeaderOptions struct {
	// Tenant-facing identifier for this campaign/stream. Combined with the
	// sending domain to form a Feedback-ID (RFC-style).
	CampaignID string
	// Sending domain (e.g. "forgemsg.example"). Used as Feedback-ID suffix.
	SendingDomain string
	// Optional category hint passed to Seznam via X-Seznam-Campaign-Category.
	// Typical values: "newsletter", "transactional", "marketing", "product".
	CampaignCategory string
	// Message stream: "broadcast" | "triggered" | "transactional". Used for
	// Feedback-ID and Precedence (transactional = no Precedence).
	Stream string
}

// ResolveIsp returns the best-known provider for the given recipient address.
// Matching is case-insensitive and compares against the host portion only.
func ResolveIsp(address string) IspType {
	at := strings.LastIndex(address, "@")
	if at < 0 || at == len(address)-1 {
		return IspUnknown
	}
	host := strings.ToLower(strings.TrimSpace(address[at+1:]))
	host = strings.TrimSuffix(host, ".")

	switch host {
	case "seznam.cz", "email.cz":
		return IspSeznam
	case "volny.cz":
		return IspVolny
	case "centrum.cz", "post.cz":
		return IspCentrum
	case "gmail.com", "googlemail.com":
		return IspGoogle
	case "outlook.com", "hotmail.com", "live.com", "msn.com":
		return IspMicrosoft
	case "icloud.com", "me.com", "mac.com":
		return IspApple
	}
	if strings.HasPrefix(host, "yahoo.") {
		return IspYahoo
	}
	return IspUnknown
}

// IspThrottle expresses the maximum concurrent connections + messages-per-hour
// guidance for a given ISP. Values are conservative defaults honored by the
// worker's per-ISP queue; a host can raise them as reputation improves.
type IspThrottle struct {
	MaxConnections int
	MaxPerHour     int
}

// RecommendedThrottle returns sensible defaults for the given ISP. Numbers are
// derived from each ISP's publicly documented sender guidance for small-to-
// medium-volume senders. Dedicated-IP customers routinely exceed these once
// reputation is established.
func RecommendedThrottle(isp IspType) IspThrottle {
	switch isp {
	case IspSeznam:
		return IspThrottle{MaxConnections: 5, MaxPerHour: 5000}
	case IspVolny, IspCentrum:
		return IspThrottle{MaxConnections: 3, MaxPerHour: 2000}
	case IspGoogle:
		return IspThrottle{MaxConnections: 10, MaxPerHour: 20000}
	case IspMicrosoft:
		return IspThrottle{MaxConnections: 5, MaxPerHour: 10000}
	case IspApple:
		return IspThrottle{MaxConnections: 5, MaxPerHour: 5000}
	case IspYahoo:
		return IspThrottle{MaxConnections: 5, MaxPerHour: 5000}
	default:
		return IspThrottle{MaxConnections: 5, MaxPerHour: 5000}
	}
}

// ApplyIspHeaders enriches headers (keyed by lowercase header name) with
// deliverability hints appropriate to the recipient's ISP. It never overwrites
// a header the caller has already set, so campaign-level overrides win.
//
// The returned IspType lets callers log/ route outbound messages into
// per-ISP queues without re-resolving.
func ApplyIspHeaders(
	headers map[string]string,
	recipient string,
	opts IspHeaderOptions,
) IspType {
	if headers == nil {
		return IspUnknown
	}
	isp := ResolveIsp(recipient)

	// Precedence: bulk — signals to non-transactional ISPs that this is a
	// marketing message. Transactional messages must NOT carry Precedence.
	if opts.Stream != "transactional" {
		setIfAbsent(headers, "precedence", "bulk")
	}

	// Feedback-ID: <campaign>:<stream>:<domain> (Google/Yahoo FBL friendly).
	if opts.CampaignID != "" && opts.SendingDomain != "" {
		stream := opts.Stream
		if stream == "" {
			stream = "broadcast"
		}
		feedbackID := fmt.Sprintf("%s:%s:forgemsg:%s", opts.CampaignID, stream, opts.SendingDomain)
		setIfAbsent(headers, "feedback-id", feedbackID)
	}

	// Auto-Submitted: auto-generated — standard RFC 3834 signal.
	setIfAbsent(headers, "auto-submitted", "auto-generated")

	switch isp {
	case IspSeznam:
		// Seznam-specific category hint (#371). Only set when the caller
		// supplies a category so we don't mis-declare message type.
		if opts.CampaignCategory != "" {
			setIfAbsent(headers, "x-seznam-campaign-category", opts.CampaignCategory)
		}
	}

	return isp
}

func setIfAbsent(headers map[string]string, key, value string) {
	key = strings.ToLower(key)
	if _, ok := headers[key]; ok {
		return
	}
	headers[key] = value
}
