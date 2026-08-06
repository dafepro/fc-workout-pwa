package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadIdentityRequiresPrivateRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.txt")
	if err := os.WriteFile(path, []byte("AGE-SECRET-KEY-TEST"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := readIdentity(path); err == nil {
		t.Fatal("readIdentity accepted a group/world-readable identity")
	}

	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	contents, err := readIdentity(path)
	if err != nil {
		t.Fatalf("readIdentity rejected a private identity: %v", err)
	}
	if contents != "AGE-SECRET-KEY-TEST" {
		t.Fatalf("readIdentity returned %q", contents)
	}

	if _, err := readIdentity(t.TempDir()); err == nil {
		t.Fatal("readIdentity accepted a directory")
	}
}
