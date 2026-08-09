package staffauth

import (
	"net/url"
	"testing"
)

// The setup token moved out of the fragment and into the query because /staff
// sits behind Cloudflare Access, whose one-time-PIN redirect cannot carry a
// fragment back to the page that needs it.
func TestSetupLinkCarriesTheTokenInTheQuery(t *testing.T) {
	link, err := setupLink("https://example.test/staff/setup", "one-time-token")
	if err != nil {
		t.Fatalf("setupLink: %v", err)
	}
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse %q: %v", link, err)
	}
	if got := parsed.Query().Get("setup"); got != "one-time-token" {
		t.Fatalf("setup query = %q, want the token", got)
	}
	if parsed.Fragment != "" {
		t.Fatalf("fragment = %q, want empty", parsed.Fragment)
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
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse %q: %v", link, err)
	}
	if got := parsed.Query().Get("setup"); got != token {
		t.Fatalf("setup query = %q, want %q", got, token)
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
	if got := parsed.Query().Get("setup"); got != "fresh" {
		t.Fatalf("setup query = %q, want the fresh token", got)
	}
	if parsed.Fragment != "" {
		t.Fatalf("fragment = %q, want empty", parsed.Fragment)
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
