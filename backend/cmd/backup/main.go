package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/dafepro/fc-workout-pwa/backend/internal/backup"
)

var version = "development"

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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch arguments[0] {
	case "create":
		flags := flag.NewFlagSet("create", flag.ContinueOnError)
		databaseURL := flags.String("database-url", valueOrDefault(os.Getenv("DATABASE_URL"), "file:data/zoomigo.db"), "SQLite database URL")
		output := flags.String("output", "", "new backup archive path")
		applicationVersion := flags.String("app-version", version, "application version recorded in the manifest")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("create does not accept positional arguments")
		}
		manifest, err := backup.Create(ctx, backup.CreateOptions{
			DatabaseURL:        *databaseURL,
			ArchivePath:        *output,
			ApplicationVersion: *applicationVersion,
		})
		if err != nil {
			return err
		}
		return writeResult("created", *output, manifest)
	case "create-encrypted":
		flags := flag.NewFlagSet("create-encrypted", flag.ContinueOnError)
		databaseURL := flags.String("database-url", valueOrDefault(os.Getenv("DATABASE_URL"), "file:data/zoomigo.db"), "SQLite database URL")
		output := flags.String("output", "", "new age-encrypted backup archive path")
		recipient := flags.String("recipient", "", "age X25519 public recipient")
		applicationVersion := flags.String("app-version", version, "application version recorded in the manifest")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("create-encrypted does not accept positional arguments")
		}
		if _, err := os.Stat(*output); err == nil {
			return errors.New("encrypted archive already exists")
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect encrypted archive: %w", err)
		}
		temporary, err := os.CreateTemp("", ".zoomigo-backup-plaintext-*.tar.gz")
		if err != nil {
			return fmt.Errorf("create temporary backup path: %w", err)
		}
		temporaryPath := temporary.Name()
		if err := temporary.Close(); err != nil {
			_ = os.Remove(temporaryPath)
			return err
		}
		if err := os.Remove(temporaryPath); err != nil {
			return err
		}
		defer os.Remove(temporaryPath)
		manifest, err := backup.Create(ctx, backup.CreateOptions{
			DatabaseURL:        *databaseURL,
			ArchivePath:        temporaryPath,
			ApplicationVersion: *applicationVersion,
		})
		if err != nil {
			return err
		}
		if err := backup.EncryptArchive(temporaryPath, *output, *recipient); err != nil {
			return err
		}
		return writeResult("created-encrypted", *output, manifest)
	case "verify":
		flags := flag.NewFlagSet("verify", flag.ContinueOnError)
		archivePath := flags.String("archive", "", "backup archive path")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("verify does not accept positional arguments")
		}
		manifest, err := backup.Verify(ctx, *archivePath)
		if err != nil {
			return err
		}
		return writeResult("verified", *archivePath, manifest)
	case "verify-encrypted":
		flags := flag.NewFlagSet("verify-encrypted", flag.ContinueOnError)
		archivePath := flags.String("archive", "", "age-encrypted backup archive path")
		identityPath := flags.String("identity", "", "age X25519 identity file path")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("verify-encrypted does not accept positional arguments")
		}
		identity, err := readIdentity(*identityPath)
		if err != nil {
			return err
		}
		manifest, err := backup.VerifyEncrypted(ctx, *archivePath, identity)
		if err != nil {
			return err
		}
		return writeResult("verified-encrypted", *archivePath, manifest)
	case "restore":
		flags := flag.NewFlagSet("restore", flag.ContinueOnError)
		archivePath := flags.String("archive", "", "backup archive path")
		target := flags.String("target", "", "new isolated SQLite database path")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("restore does not accept positional arguments")
		}
		manifest, err := backup.Restore(ctx, backup.RestoreOptions{
			ArchivePath:  *archivePath,
			DatabasePath: *target,
		})
		if err != nil {
			return err
		}
		return writeResult("restored", *target, manifest)
	case "restore-encrypted":
		flags := flag.NewFlagSet("restore-encrypted", flag.ContinueOnError)
		archivePath := flags.String("archive", "", "age-encrypted backup archive path")
		identityPath := flags.String("identity", "", "age X25519 identity file path")
		target := flags.String("target", "", "new isolated SQLite database path")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return errors.New("restore-encrypted does not accept positional arguments")
		}
		identity, err := readIdentity(*identityPath)
		if err != nil {
			return err
		}
		manifest, err := backup.RestoreEncrypted(ctx, backup.RestoreOptions{
			ArchivePath:  *archivePath,
			DatabasePath: *target,
		}, identity)
		if err != nil {
			return err
		}
		return writeResult("restored-encrypted", *target, manifest)
	default:
		return usageError()
	}
}

func writeResult(status, path string, manifest backup.Manifest) error {
	return json.NewEncoder(os.Stdout).Encode(struct {
		Status        string `json:"status"`
		Path          string `json:"path"`
		FormatVersion int    `json:"formatVersion"`
		CreatedAt     string `json:"createdAt"`
	}{
		Status:        status,
		Path:          path,
		FormatVersion: manifest.FormatVersion,
		CreatedAt:     manifest.CreatedAt,
	})
}

func usageError() error {
	return errors.New("usage: zoomigo-backup create|create-encrypted|verify|verify-encrypted|restore|restore-encrypted [flags]")
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

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
