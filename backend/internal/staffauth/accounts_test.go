package staffauth

import (
	"net/url"
	"strings"
	"testing"
)

// The token rides in the fragment, which a browser never sends, so it reaches
// no server and lands in no request log. It spent a while in the query because
// Cloudflare Access's one-time-PIN redirect could not carry a fragment back to
// the page that needed it; that gate is gone.
func TestSetupLinkCarriesTheTokenInTheFragment(t *testing.T) {
	link, err := setupLink("https://example.test/staff/setup", "one-time-token")
	if err != nil {
		t.Fatalf("setupLink: %v", err)
	}
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse %q: %v", link, err)
	}
	if got := fragmentToken(t, link); got != "one-time-token" {
		t.Fatalf("setup fragment = %q, want the token", got)
	}
	if parsed.RawQuery != "" {
		t.Fatalf("query = %q, want empty: the token must reach no server", parsed.RawQuery)
	}
}

// Read from the raw link exactly as the page reads it: everything after the
// first "#", decoded once, the way URLSearchParams does it. Going through
// url.URL.Fragment instead would decode a second time and hide a link that had
// been escaped twice.
func fragmentToken(t *testing.T, link string) string {
	t.Helper()
	_, raw, found := strings.Cut(link, "#")
	if !found {
		t.Fatalf("link %q has no fragment", link)
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("parse fragment %q: %v", raw, err)
	}
	return values.Get("setup")
}

// Pinned as a literal because the round-trip assertions above cannot see a
// double escape: they decode as many times as the builder encoded. Assigning
// pre-encoded text to url.URL.Fragment produced "%252B" here, which every
// symmetric test still passed and no browser would have read correctly.
func TestSetupLinkEscapesTheTokenExactlyOnce(t *testing.T) {
	link, err := setupLink("https://example.test/staff/setup", "a+b/c=d&e")
	if err != nil {
		t.Fatalf("setupLink: %v", err)
	}
	const want = "https://example.test/staff/setup#setup=a%2Bb%2Fc%3Dd%26e"
	if link != want {
		t.Fatalf("link = %q, want %q", link, want)
	}
}

// A token with URL-significant bytes has to survive the round trip; base64url
// avoids most of them, but the encoding is the guarantee, not the alphabet.
func TestSetupLinkEscapesTheToken(t *testing.T) {
	const token = "a+b/c=d&e"
	link, err := setupLink("https://example.test/staff/setup", token)
	if err != nil {
		t.Fatalf("setupLink: %v", err)
	}
	if got := fragmentToken(t, link); got != token {
		t.Fatalf("setup fragment = %q, want %q", got, token)
	}
}

// Whatever the operator configured as the base URL, the issued link must not
// keep a stale token from it in either position.
func TestSetupLinkReplacesExistingTokens(t *testing.T) {
	link, err := setupLink("https://example.test/staff/setup?setup=stale&ref=email#setup=older", "fresh")
	if err != nil {
		t.Fatalf("setupLink: %v", err)
	}
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse %q: %v", link, err)
	}
	if got := fragmentToken(t, link); got != "fresh" {
		t.Fatalf("setup fragment = %q, want the fresh token", got)
	}
	if parsed.Query().Has("setup") {
		t.Fatalf("query = %q, still carries a token", parsed.RawQuery)
	}
	if got := parsed.Query().Get("ref"); got != "email" {
		t.Fatalf("ref query = %q, want it preserved", got)
	}
}

func TestSetupLinkRefusesNonHTTPSBases(t *testing.T) {
	for _, raw := range []string{"http://example.test/staff/setup", "/staff/setup", "https://user@example.test/staff/setup", "::"} {
		if _, err := setupLink(raw, "token"); err == nil {
			t.Fatalf("setupLink(%q) succeeded, want an error", raw)
		}
	}
}
