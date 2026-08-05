package migrations

import "embed"

// Files contains the versioned SQL migrations shipped in the API binary.
//
//go:embed *.sql
var Files embed.FS
