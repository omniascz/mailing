package pool

import (
	"net"
	"strings"
	"testing"
)

// The address the pool reports has to be the address the connection actually
// went out from — not merely a non-empty string, and not the value somebody
// asked for.
//
// So the far end is the witness. A listener on loopback accepts the
// connection and reads its own RemoteAddr, which IS the source address the
// kernel used, observed from outside this process. If localIPOf disagrees with
// that, the value would be attributed to the wrong IP's reputation.
func TestLocalIPOfMatchesWhatThePeerSees(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	type peer struct {
		remote string
		err    error
	}
	accepted := make(chan peer, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			accepted <- peer{err: err}
			return
		}
		defer c.Close()
		host, _, splitErr := net.SplitHostPort(c.RemoteAddr().String())
		accepted <- peer{remote: host, err: splitErr}
	}()

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	got := localIPOf(conn)
	p := <-accepted
	if p.err != nil {
		t.Fatalf("accept: %v", p.err)
	}

	// What the peer saw, normalised the same way — a dual-stack loopback can
	// present ::ffff:127.0.0.1 on one side and 127.0.0.1 on the other.
	want := p.remote
	if ip := net.ParseIP(want); ip != nil {
		if v4 := ip.To4(); v4 != nil {
			want = v4.String()
		} else {
			want = ip.String()
		}
	}

	if got != want {
		t.Fatalf("reported source address %q, but the peer saw the connection arrive from %q", got, want)
	}
	if got == "" {
		t.Fatal("reported an empty source address for a connected socket")
	}
}

// The port must not be in it. LocalAddr().String() on TCP yields "IP:port",
// and a port changes per connection — a value carrying one would never match a
// configured address, so every message would look like it came from an address
// nobody has ever heard of.
func TestLocalIPOfCarriesNoPort(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err == nil {
			c.Close()
		}
	}()

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	got := localIPOf(conn)
	if strings.Contains(got, ":") && net.ParseIP(got) == nil {
		t.Fatalf("source address %q is not a bare IP", got)
	}
	if net.ParseIP(got) == nil {
		t.Fatalf("source address %q does not parse as an IP", got)
	}
	// Belt and braces: the raw form the naive implementation would have used.
	if raw := conn.LocalAddr().String(); raw == got {
		t.Fatalf("reported LocalAddr().String() verbatim (%q) — that includes the port", raw)
	}
}

// An explicitly bound socket reports the address it was bound to. This is the
// dedicated path, where the API already knows the answer — and the two must
// agree, or the disagreement the sender reports would be noise.
func TestLocalIPOfReportsTheBoundAddress(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err == nil {
			c.Close()
		}
	}()

	dialer := &net.Dialer{LocalAddr: &net.TCPAddr{IP: net.ParseIP("127.0.0.1")}}
	conn, err := dialer.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("dial from 127.0.0.1: %v", err)
	}
	defer conn.Close()

	if got := localIPOf(conn); got != "127.0.0.1" {
		t.Fatalf("bound to 127.0.0.1 but reported %q", got)
	}
}

// nil is the one input that cannot produce an address, and it must produce an
// empty string rather than panic: a wrong address here lands on a real IP's
// reputation, so "we do not know" has to be representable.
func TestLocalIPOfNilIsEmpty(t *testing.T) {
	if got := localIPOf(nil); got != "" {
		t.Fatalf("nil conn reported %q, want empty", got)
	}
}
