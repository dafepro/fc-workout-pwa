package backup

import (
	"archive/tar"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	_ "modernc.org/sqlite"
)

const (
	rewardMediaBundleName = "reward-media.tar"
	maxRewardMediaFile    = 2 << 20
	maxRewardMediaBundle  = 2 << 30
)

type RewardMediaManifest struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
	Count  int    `json:"count"`
}

type rewardMediaExpected struct {
	DisplaySHA256 string
}

func createRewardMediaBundle(ctx context.Context, databasePath, sourceDirectory, bundlePath string, modifiedAt time.Time) (RewardMediaManifest, error) {
	expected, err := rewardMediaExpectedFromDatabase(ctx, databasePath)
	if err != nil {
		return RewardMediaManifest{}, err
	}
	return createRewardMediaBundleFromExpected(expected, sourceDirectory, bundlePath, modifiedAt)
}

func createRewardMediaBundleFromExpected(expected map[string]rewardMediaExpected, sourceDirectory, bundlePath string, modifiedAt time.Time) (RewardMediaManifest, error) {
	if len(expected) > 0 && strings.TrimSpace(sourceDirectory) == "" {
		return RewardMediaManifest{}, errors.New("reward media directory is required because the database contains reward images")
	}
	if strings.TrimSpace(sourceDirectory) == "" {
		return RewardMediaManifest{}, nil
	}
	root, err := filepath.Abs(sourceDirectory)
	if err != nil {
		return RewardMediaManifest{}, fmt.Errorf("resolve reward media directory: %w", err)
	}
	if info, statErr := os.Stat(root); statErr != nil || !info.IsDir() {
		return RewardMediaManifest{}, errors.New("reward media directory is unavailable")
	}
	file, err := os.OpenFile(bundlePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode)
	if err != nil {
		return RewardMediaManifest{}, fmt.Errorf("create reward media bundle: %w", err)
	}
	writer := tar.NewWriter(file)
	fail := func(err error) (RewardMediaManifest, error) {
		_ = writer.Close()
		_ = file.Close()
		_ = os.Remove(bundlePath)
		return RewardMediaManifest{}, err
	}
	keys := make([]string, 0, len(expected))
	for key := range expected {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !rewardmedia.ValidStorageKey(key) {
			return fail(fmt.Errorf("database contains invalid reward media key %q", key))
		}
		for _, name := range []string{"display.jpg", "thumbnail.jpg"} {
			path := filepath.Join(root, key, name)
			info, statErr := os.Lstat(path)
			if statErr != nil || !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > maxRewardMediaFile {
				return fail(fmt.Errorf("reward media %s/%s is missing or invalid", key, name))
			}
			if name == "display.jpg" {
				digest, _, hashErr := hashFile(path)
				if hashErr != nil || digest != expected[key].DisplaySHA256 {
					return fail(fmt.Errorf("reward media %s does not match its database digest", key))
				}
			}
			if err = writer.WriteHeader(&tar.Header{Name: key + "/" + name, Mode: archiveFileMode, Size: info.Size(), ModTime: modifiedAt}); err != nil {
				return fail(fmt.Errorf("write reward media header: %w", err))
			}
			source, openErr := os.Open(path)
			if openErr != nil {
				return fail(openErr)
			}
			_, copyErr := io.Copy(writer, source)
			if closeErr := source.Close(); copyErr == nil {
				copyErr = closeErr
			}
			if copyErr != nil {
				return fail(fmt.Errorf("copy reward media: %w", copyErr))
			}
		}
	}
	if err = writer.Close(); err != nil {
		return fail(fmt.Errorf("finish reward media bundle: %w", err))
	}
	if err = file.Sync(); err != nil {
		_ = file.Close()
		return RewardMediaManifest{}, err
	}
	if err = file.Close(); err != nil {
		return RewardMediaManifest{}, err
	}
	digest, bytes, err := hashFile(bundlePath)
	if err != nil {
		return RewardMediaManifest{}, err
	}
	return RewardMediaManifest{Path: rewardMediaBundleName, SHA256: digest, Bytes: bytes, Count: len(keys)}, nil
}

func verifyRewardMediaBundle(ctx context.Context, databasePath, bundlePath string, manifest *RewardMediaManifest) (string, error) {
	expected, err := rewardMediaExpectedFromDatabase(ctx, databasePath)
	if err != nil {
		return "", err
	}
	return verifyRewardMediaBundleFromExpected(expected, bundlePath, manifest)
}

func verifyRewardMediaBundleFromExpected(expected map[string]rewardMediaExpected, bundlePath string, manifest *RewardMediaManifest) (string, error) {
	if manifest == nil {
		if len(expected) > 0 {
			return "", errors.New("backup database references reward media but the archive has no media bundle")
		}
		return "", nil
	}
	if manifest.Path != rewardMediaBundleName || manifest.Count != len(expected) || manifest.Bytes < 0 || manifest.Bytes > maxRewardMediaBundle {
		return "", errors.New("reward media manifest is invalid")
	}
	digest, size, err := hashFile(bundlePath)
	if err != nil || digest != manifest.SHA256 || size != manifest.Bytes {
		return "", errors.New("reward media bundle does not match its manifest")
	}
	directory, err := os.MkdirTemp(filepath.Dir(bundlePath), ".reward-media-verify-*")
	if err != nil {
		return "", err
	}
	fail := func(err error) (string, error) {
		_ = os.RemoveAll(directory)
		return "", err
	}
	file, err := os.Open(bundlePath)
	if err != nil {
		return fail(err)
	}
	defer file.Close()
	reader := tar.NewReader(file)
	seen := map[string]map[string]bool{}
	for {
		header, readErr := reader.Next()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return fail(readErr)
		}
		parts := strings.Split(header.Name, "/")
		if len(parts) != 2 || !rewardmedia.ValidStorageKey(parts[0]) ||
			(parts[1] != "display.jpg" && parts[1] != "thumbnail.jpg") || header.Typeflag != tar.TypeReg ||
			header.Size < 1 || header.Size > maxRewardMediaFile || expected[parts[0]].DisplaySHA256 == "" {
			return fail(fmt.Errorf("reward media bundle contains unexpected entry %q", header.Name))
		}
		if seen[parts[0]] == nil {
			seen[parts[0]] = map[string]bool{}
		}
		if seen[parts[0]][parts[1]] {
			return fail(fmt.Errorf("reward media bundle repeats %q", header.Name))
		}
		seen[parts[0]][parts[1]] = true
		targetDirectory := filepath.Join(directory, parts[0])
		if err = os.MkdirAll(targetDirectory, archiveDirectoryMode); err != nil {
			return fail(err)
		}
		targetPath := filepath.Join(targetDirectory, parts[1])
		target, createErr := os.OpenFile(targetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode)
		if createErr != nil {
			return fail(createErr)
		}
		written, copyErr := io.CopyN(target, reader, header.Size)
		if closeErr := target.Close(); copyErr == nil {
			copyErr = closeErr
		}
		if copyErr != nil || written != header.Size {
			return fail(errors.New("extract reward media bundle failed"))
		}
		if parts[1] == "display.jpg" {
			displayDigest, _, hashErr := hashFile(targetPath)
			if hashErr != nil || displayDigest != expected[parts[0]].DisplaySHA256 {
				return fail(fmt.Errorf("reward media %s digest is invalid", parts[0]))
			}
		}
	}
	for key := range expected {
		if !seen[key]["display.jpg"] || !seen[key]["thumbnail.jpg"] {
			return fail(fmt.Errorf("reward media bundle is missing renditions for %s", key))
		}
	}
	return directory, nil
}

func rewardMediaExpectedFromLogical(directory string, manifest LogicalManifest) (map[string]rewardMediaExpected, error) {
	result := map[string]rewardMediaExpected{}
	for _, descriptor := range manifest.Tables {
		if descriptor.Name != "team_reward_media" {
			continue
		}
		err := readLogicalRows(directory, descriptor, func(_ int64, row map[string]json.RawMessage) error {
			var key, digest string
			if err := json.Unmarshal(row["storage_key"], &key); err != nil {
				return err
			}
			if err := json.Unmarshal(row["sha256"], &digest); err != nil {
				return err
			}
			if deleted, present := row["deleted_at"]; present && string(deleted) != "null" {
				return nil
			}
			result[key] = rewardMediaExpected{DisplaySHA256: digest}
			return nil
		})
		return result, err
	}
	return result, nil
}

func rewardMediaExpectedFromDatabase(ctx context.Context, databasePath string) (map[string]rewardMediaExpected, error) {
	db, err := sql.Open("sqlite", readOnlyDatabaseURL(databasePath))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	return rewardMediaExpectedFromQuerier(ctx, db)
}

type rewardMediaQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func rewardMediaExpectedFromQuerier(ctx context.Context, querier rewardMediaQuerier) (map[string]rewardMediaExpected, error) {
	var exists int
	if err := querier.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'team_reward_media'`).Scan(&exists); err != nil {
		return nil, err
	}
	result := map[string]rewardMediaExpected{}
	if exists == 0 {
		return result, nil
	}
	rows, err := querier.QueryContext(ctx, `SELECT storage_key, sha256 FROM team_reward_media WHERE deleted_at IS NULL ORDER BY storage_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, digest string
		if err = rows.Scan(&key, &digest); err != nil {
			return nil, err
		}
		result[key] = rewardMediaExpected{DisplaySHA256: digest}
	}
	return result, rows.Err()
}

func publishRewardMediaRestore(sourceDirectory, targetDirectory string) error {
	if sourceDirectory == "" {
		return nil
	}
	if err := requireNewPath(targetDirectory, "reward media restore target"); err != nil {
		return err
	}
	parent := filepath.Dir(targetDirectory)
	if err := os.MkdirAll(parent, archiveDirectoryMode); err != nil {
		return err
	}
	temporary, err := os.MkdirTemp(parent, ".reward-media-restore-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temporary)
	entries, err := os.ReadDir(sourceDirectory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		keyDirectory := filepath.Join(temporary, entry.Name())
		if err = os.Mkdir(keyDirectory, archiveDirectoryMode); err != nil {
			return err
		}
		for _, name := range []string{"display.jpg", "thumbnail.jpg"} {
			targetPath := filepath.Join(keyDirectory, name)
			target, createErr := os.OpenFile(targetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode)
			if createErr != nil {
				return createErr
			}
			if createErr = target.Close(); createErr != nil {
				return createErr
			}
			if err = copyFile(filepath.Join(sourceDirectory, entry.Name(), name), targetPath); err != nil {
				return err
			}
		}
	}
	if err = os.Rename(temporary, targetDirectory); err != nil {
		return fmt.Errorf("publish reward media restore: %w", err)
	}
	return nil
}
