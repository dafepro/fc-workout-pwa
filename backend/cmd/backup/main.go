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
		databaseURL := flags.String("database-url", valueOrDefault(os.Getenv("DATABASE_URL"), "file:data/stridecrew.db"), "SQLite database URL")
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
	return errors.New("usage: stridecrew-backup create|verify|restore [flags]")
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
