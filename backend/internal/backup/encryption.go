package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"filippo.io/age"
)

const maxEncryptedArchiveBytes = maxDatabaseBytes + 16<<20

func EncryptArchive(plainPath, encryptedPath, recipientText string) error {
	recipient, err := age.ParseX25519Recipient(strings.TrimSpace(recipientText))
	if err != nil {
		return fmt.Errorf("parse backup recipient: %w", err)
	}
	if err := requireNewPath(encryptedPath, "encrypted archive"); err != nil {
		return err
	}
	source, err := os.Open(plainPath)
	if err != nil {
		return fmt.Errorf("open verified backup payload: %w", err)
	}
	defer source.Close()

	directory := filepath.Dir(encryptedPath)
	if err := os.MkdirAll(directory, archiveDirectoryMode); err != nil {
		return fmt.Errorf("create encrypted archive directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".zoomigo-backup-encrypted-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary encrypted archive: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(archiveFileMode); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("secure temporary encrypted archive: %w", err)
	}

	encryptedWriter, err := age.Encrypt(temporary, recipient)
	if err != nil {
		_ = temporary.Close()
		return fmt.Errorf("start backup encryption: %w", err)
	}
	if _, err := io.Copy(encryptedWriter, source); err != nil {
		_ = encryptedWriter.Close()
		_ = temporary.Close()
		return fmt.Errorf("encrypt backup payload: %w", err)
	}
	if err := encryptedWriter.Close(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("finish backup encryption: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("sync encrypted backup: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close encrypted backup: %w", err)
	}
	if err := os.Rename(temporaryPath, encryptedPath); err != nil {
		return fmt.Errorf("publish encrypted backup: %w", err)
	}
	return nil
}

func VerifyEncrypted(ctx context.Context, encryptedPath, identityText string) (Manifest, error) {
	plainPath, err := decryptArchiveToTemporary(encryptedPath, identityText)
	if err != nil {
		return Manifest{}, err
	}
	defer os.Remove(plainPath)
	return Verify(ctx, plainPath)
}

func RestoreEncrypted(ctx context.Context, options RestoreOptions, identityText string) (Manifest, error) {
	plainPath, err := decryptArchiveToTemporary(options.ArchivePath, identityText)
	if err != nil {
		return Manifest{}, err
	}
	defer os.Remove(plainPath)
	options.ArchivePath = plainPath
	return Restore(ctx, options)
}

// The operator supplies the file age-keygen produced, comment lines and all.
// Exactly one key must remain after those are skipped: an archive has one
// recovery key, and a file holding several means the wrong file was supplied.
func parseBackupIdentity(identityText string) (age.Identity, error) {
	identities, err := age.ParseIdentities(strings.NewReader(identityText))
	if err != nil {
		return nil, fmt.Errorf("parse backup identity: %w", err)
	}
	if len(identities) != 1 {
		return nil, fmt.Errorf("backup identity file must hold exactly one key, found %d", len(identities))
	}
	return identities[0], nil
}

func decryptArchiveToTemporary(encryptedPath, identityText string) (string, error) {
	identity, err := parseBackupIdentity(identityText)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(encryptedPath)
	if err != nil {
		return "", fmt.Errorf("inspect encrypted backup: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxEncryptedArchiveBytes {
		return "", errors.New("encrypted backup size is invalid")
	}
	source, err := os.Open(encryptedPath)
	if err != nil {
		return "", fmt.Errorf("open encrypted backup: %w", err)
	}
	defer source.Close()
	reader, err := age.Decrypt(source, identity)
	if err != nil {
		return "", fmt.Errorf("decrypt backup: %w", err)
	}
	temporary, err := os.CreateTemp("", ".zoomigo-backup-decrypted-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create temporary decrypted backup: %w", err)
	}
	temporaryPath := temporary.Name()
	fail := func(err error) (string, error) {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
		return "", err
	}
	if err := temporary.Chmod(archiveFileMode); err != nil {
		return fail(fmt.Errorf("secure temporary decrypted backup: %w", err))
	}
	written, err := io.Copy(temporary, io.LimitReader(reader, maxEncryptedArchiveBytes+1))
	if err != nil {
		return fail(fmt.Errorf("decrypt backup payload: %w", err))
	}
	if written > maxEncryptedArchiveBytes {
		return fail(errors.New("decrypted backup is too large"))
	}
	if err := temporary.Sync(); err != nil {
		return fail(fmt.Errorf("sync temporary decrypted backup: %w", err))
	}
	if err := temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return "", fmt.Errorf("close temporary decrypted backup: %w", err)
	}
	return temporaryPath, nil
}
