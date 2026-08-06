package main

import "testing"

func TestLoginLinkKeepsCredentialOutOfServerRequest(t *testing.T) {
	link, err := loginLink("https://stridecrew.example/login", "secret_token")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://stridecrew.example/login#credential=secret_token" {
		t.Fatalf("unexpected link: %s", link)
	}
}

func TestLoginLinkRequiresHTTPS(t *testing.T) {
	for _, raw := range []string{"", "http://stridecrew.example/login", "https://user@example.com/login"} {
		if _, err := loginLink(raw, "secret_token"); err == nil {
			t.Fatalf("loginLink(%q) expected an error", raw)
		}
	}
}

func TestLoginLinkReplacesExistingFragment(t *testing.T) {
	link, err := loginLink("https://stridecrew.example/login#old", "one_two-two")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://stridecrew.example/login#credential=one_two-two" {
		t.Fatalf("unexpected link: %s", link)
	}
}
