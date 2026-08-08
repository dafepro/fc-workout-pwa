package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
)

var version = "development"

// create/verify/restore work on the same-engine SQLite snapshot;
// export/verify-export/import work on the engine-independent logical format.
var commandFlags = map[string][]string{
	"create":                  {"database-url", "output", "app-version"},
	"create-encrypted":        {"database-url", "output", "recipient", "app-version"},
	"verify":                  {"archive"},
	"verify-encrypted":        {"archive", "identity"},
	"restore":                 {"archive", "target"},
	"restore-encrypted":       {"archive", "identity", "target"},
	"export":                  {"database-url", "output", "app-version"},
	"export-encrypted":        {"database-url", "output", "recipient", "app-version"},
	"verify-export":           {"archive"},
	"verify-export-encrypted": {"archive", "identity"},
	"import":                  {"archive", "target"},
	"import-encrypted":        {"archive", "identity", "target"},
}

type options struct {
	databaseURL        string
	output             string
	archive            string
	target             string
	recipient          string
	identity           string
	applicationVersion string
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "backup:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) == 0 {
		return usageError()
	}
	name := arguments[0]
	flagNames, known := commandFlags[name]
	if !known {
		return usageError()
	}
	parsed, err := parseOptions(name, flagNames, arguments[1:])
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch name {
	case "create":
		manifest, err := backup.Create(ctx, parsed.createOptions())
		return report(err, "created", parsed.output, manifest.FormatVersion, manifest.CreatedAt)
	case "create-encrypted":
		manifest, err := produceEncrypted(parsed.output, parsed.recipient, func(path string) (backup.Manifest, error) {
			created := parsed.createOptions()
			created.ArchivePath = path
			return backup.Create(ctx, created)
		})
		return report(err, "created-encrypted", parsed.output, manifest.FormatVersion, manifest.CreatedAt)
	case "verify":
		manifest, err := backup.Verify(ctx, parsed.archive)
		return report(err, "verified", parsed.archive, manifest.FormatVersion, manifest.CreatedAt)
	case "verify-encrypted":
		manifest, err := backup.VerifyEncrypted(ctx, parsed.archive, parsed.identity)
		return report(err, "verified-encrypted", parsed.archive, manifest.FormatVersion, manifest.CreatedAt)
	case "restore":
		manifest, err := backup.Restore(ctx, backup.RestoreOptions{ArchivePath: parsed.archive, DatabasePath: parsed.target})
		return report(err, "restored", parsed.target, manifest.FormatVersion, manifest.CreatedAt)
	case "restore-encrypted":
		manifest, err := backup.RestoreEncrypted(ctx, backup.RestoreOptions{ArchivePath: parsed.archive, DatabasePath: parsed.target}, parsed.identity)
		return report(err, "restored-encrypted", parsed.target, manifest.FormatVersion, manifest.CreatedAt)
	case "export":
		manifest, err := backup.ExportLogical(ctx, parsed.exportOptions())
		return report(err, "exported", parsed.output, manifest.FormatVersion, manifest.CreatedAt)
	case "export-encrypted":
		manifest, err := produceEncrypted(parsed.output, parsed.recipient, func(path string) (backup.LogicalManifest, error) {
			exported := parsed.exportOptions()
			exported.ArchivePath = path
			return backup.ExportLogical(ctx, exported)
		})
		return report(err, "exported-encrypted", parsed.output, manifest.FormatVersion, manifest.CreatedAt)
	case "verify-export":
		manifest, err := backup.VerifyLogical(ctx, parsed.archive)
		return report(err, "verified-export", parsed.archive, manifest.FormatVersion, manifest.CreatedAt)
	case "verify-export-encrypted":
		manifest, err := backup.VerifyLogicalEncrypted(ctx, parsed.archive, parsed.identity)
		return report(err, "verified-export-encrypted", parsed.archive, manifest.FormatVersion, manifest.CreatedAt)
	case "import":
		manifest, err := backup.ImportLogical(ctx, backup.LogicalImportOptions{ArchivePath: parsed.archive, DatabasePath: parsed.target})
		return report(err, "imported", parsed.target, manifest.FormatVersion, manifest.CreatedAt)
	case "import-encrypted":
		manifest, err := backup.ImportLogicalEncrypted(ctx, backup.LogicalImportOptions{ArchivePath: parsed.archive, DatabasePath: parsed.target}, parsed.identity)
		return report(err, "imported-encrypted", parsed.target, manifest.FormatVersion, manifest.CreatedAt)
	default:
		return usageError()
	}
}

func parseOptions(name string, flagNames, arguments []string) (options, error) {
	var parsed options
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	for _, flagName := range flagNames {
		switch flagName {
		case "database-url":
			flags.StringVar(&parsed.databaseURL, flagName, valueOrDefault(os.Getenv("DATABASE_URL"), "file:data/zoomigo.db"), "SQLite database URL")
		case "output":
			flags.StringVar(&parsed.output, flagName, "", "new output archive path")
		case "archive":
			flags.StringVar(&parsed.archive, flagName, "", "input archive path")
		case "target":
			flags.StringVar(&parsed.target, flagName, "", "new isolated SQLite database path")
		case "recipient":
			flags.StringVar(&parsed.recipient, flagName, "", "age X25519 public recipient")
		case "identity":
			flags.StringVar(&parsed.identity, flagName, "", "age X25519 identity file path")
		case "app-version":
			flags.StringVar(&parsed.applicationVersion, flagName, version, "application version recorded in the manifest")
		}
	}
	if err := flags.Parse(arguments); err != nil {
		return options{}, err
	}
	if flags.NArg() != 0 {
		return options{}, fmt.Errorf("%s does not accept positional arguments", name)
	}
	if contains(flagNames, "identity") {
		identity, err := readIdentity(parsed.identity)
		if err != nil {
			return options{}, err
		}
		parsed.identity = identity
	}
	return parsed, nil
}

func (parsed options) createOptions() backup.CreateOptions {
	return backup.CreateOptions{
		DatabaseURL:        parsed.databaseURL,
		ArchivePath:        parsed.output,
		ApplicationVersion: parsed.applicationVersion,
	}
}

func (parsed options) exportOptions() backup.LogicalExportOptions {
	return backup.LogicalExportOptions{
		DatabaseURL:        parsed.databaseURL,
		ArchivePath:        parsed.output,
		ApplicationVersion: parsed.applicationVersion,
	}
}

// Builds the payload at a private temporary path so plaintext never reaches output.
func produceEncrypted[M any](output, recipient string, produce func(path string) (M, error)) (M, error) {
	var empty M
	if _, err := os.Stat(output); err == nil {
		return empty, errors.New("encrypted archive already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return empty, fmt.Errorf("inspect encrypted archive: %w", err)
	}
	temporary, err := os.CreateTemp("", ".zoomigo-backup-plaintext-*.tar.gz")
	if err != nil {
		return empty, fmt.Errorf("create temporary backup path: %w", err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return empty, err
	}
	if err := os.Remove(temporaryPath); err != nil {
		return empty, err
	}
	defer os.Remove(temporaryPath)
	manifest, err := produce(temporaryPath)
	if err != nil {
		return empty, err
	}
	if err := backup.EncryptArchive(temporaryPath, output, recipient); err != nil {
		return empty, err
	}
	return manifest, nil
}

func report(err error, status, path string, formatVersion int, createdAt string) error {
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Status        string `json:"status"`
		Path          string `json:"path"`
		FormatVersion int    `json:"formatVersion"`
		CreatedAt     string `json:"createdAt"`
	}{
		Status:        status,
		Path:          path,
		FormatVersion: formatVersion,
		CreatedAt:     createdAt,
	})
}

func usageError() error {
	names := make([]string, 0, len(commandFlags))
	for name := range commandFlags {
		names = append(names, name)
	}
	sort.Strings(names)
	return errors.New("usage: zoomigo-backup " + strings.Join(names, "|") + " [flags]")
}

func readIdentity(path string) (string, error) {
	if path == "" {
		return "", errors.New("identity file is required")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("inspect identity file: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > 16*1024 {
		return "", errors.New("identity file is invalid")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return "", errors.New("identity file must not be readable or writable by group or others")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read identity file: %w", err)
	}
	return string(contents), nil
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
