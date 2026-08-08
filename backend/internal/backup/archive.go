package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/migrations"
	_ "modernc.org/sqlite"
)

const (
	FormatVersion        = 1
	manifestName         = "manifest.json"
	databaseName         = "database.sqlite3"
	checksumsName        = "SHA256SUMS"
	maxManifestBytes     = 1 << 20
	maxChecksumsBytes    = 1 << 20
	maxDatabaseBytes     = 64 << 30
	defaultAppVersion    = "development"
	databaseEngine       = "sqlite"
	archiveFileMode      = 0o600
	archiveDirectoryMode = 0o700
)

type CreateOptions struct {
	DatabaseURL        string
	ArchivePath        string
	ApplicationVersion string
	Now                func() time.Time
}

type RestoreOptions struct {
	ArchivePath  string
	DatabasePath string
}

type Manifest struct {
	FormatVersion      int              `json:"formatVersion"`
	CreatedAt          string           `json:"createdAt"`
	ApplicationVersion string           `json:"applicationVersion"`
	Database           DatabaseManifest `json:"database"`
	Counts             ValidationCounts `json:"counts"`
	Encrypted          bool             `json:"encrypted"`
}

type DatabaseManifest struct {
	Engine           string `json:"engine"`
	SQLiteVersion    string `json:"sqliteVersion"`
	SchemaMigrations []int  `json:"schemaMigrations"`
	Path             string `json:"path"`
	SHA256           string `json:"sha256"`
	Bytes            int64  `json:"bytes"`
}

type ValidationCounts struct {
	Clubs           int64 `json:"clubs"`
	Teams           int64 `json:"teams"`
	Players         int64 `json:"players"`
	TrainingEntries int64 `json:"trainingEntries"`
	Reactions       int64 `json:"reactions"`
}

type extractedArchive struct {
	directory    string
	manifest     Manifest
	databasePath string
}

func Create(ctx context.Context, options CreateOptions) (Manifest, error) {
	if strings.TrimSpace(options.DatabaseURL) == "" {
		return Manifest{}, errors.New("database URL is required")
	}
	if err := requireNewPath(options.ArchivePath, "archive"); err != nil {
		return Manifest{}, err
	}
	archiveDirectory := filepath.Dir(options.ArchivePath)
	if err := os.MkdirAll(archiveDirectory, archiveDirectoryMode); err != nil {
		return Manifest{}, fmt.Errorf("create archive directory: %w", err)
	}

	workingDirectory, err := os.MkdirTemp(archiveDirectory, ".zoomigo-backup-create-*")
	if err != nil {
		return Manifest{}, fmt.Errorf("create backup work directory: %w", err)
	}
	defer os.RemoveAll(workingDirectory)
	snapshotPath := filepath.Join(workingDirectory, databaseName)

	db, err := database.Open(ctx, options.DatabaseURL)
	if err != nil {
		return Manifest{}, fmt.Errorf("open source database: %w", err)
	}
	if _, err := db.ExecContext(ctx, "VACUUM INTO ?", filepath.ToSlash(snapshotPath)); err != nil {
		_ = db.Close()
		return Manifest{}, fmt.Errorf("create consistent sqlite snapshot: %w", err)
	}
	if err := db.Close(); err != nil {
		return Manifest{}, fmt.Errorf("close source database: %w", err)
	}
	if err := os.Chmod(snapshotPath, archiveFileMode); err != nil {
		return Manifest{}, fmt.Errorf("secure sqlite snapshot: %w", err)
	}

	snapshot, err := inspectDatabase(ctx, snapshotPath)
	if err != nil {
		return Manifest{}, fmt.Errorf("verify sqlite snapshot: %w", err)
	}
	databaseHash, databaseBytes, err := hashFile(snapshotPath)
	if err != nil {
		return Manifest{}, err
	}
	now := time.Now
	if options.Now != nil {
		now = options.Now
	}
	applicationVersion := strings.TrimSpace(options.ApplicationVersion)
	if applicationVersion == "" {
		applicationVersion = defaultAppVersion
	}
	manifest := Manifest{
		FormatVersion:      FormatVersion,
		CreatedAt:          now().UTC().Format(time.RFC3339),
		ApplicationVersion: applicationVersion,
		Database: DatabaseManifest{
			Engine:           databaseEngine,
			SQLiteVersion:    snapshot.sqliteVersion,
			SchemaMigrations: snapshot.schemaMigrations,
			Path:             databaseName,
			SHA256:           databaseHash,
			Bytes:            databaseBytes,
		},
		Counts:    snapshot.counts,
		Encrypted: false,
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return Manifest{}, fmt.Errorf("encode backup manifest: %w", err)
	}
	manifestBytes = append(manifestBytes, '\n')
	checksums := []byte(fmt.Sprintf(
		"%s  %s\n%s  %s\n",
		databaseHash,
		databaseName,
		hashBytes(manifestBytes),
		manifestName,
	))

	temporaryArchive, err := os.CreateTemp(archiveDirectory, ".zoomigo-backup-*.tmp")
	if err != nil {
		return Manifest{}, fmt.Errorf("create temporary archive: %w", err)
	}
	temporaryPath := temporaryArchive.Name()
	if err := temporaryArchive.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return Manifest{}, fmt.Errorf("close temporary archive: %w", err)
	}
	defer os.Remove(temporaryPath)
	if err := writeTarGzArchive(temporaryPath, []archiveEntry{
		{name: manifestName, contents: manifestBytes},
		{name: databaseName, sourcePath: snapshotPath},
		{name: checksumsName, contents: checksums},
	}, now().UTC()); err != nil {
		return Manifest{}, err
	}
	verified, err := extractAndVerify(ctx, temporaryPath)
	if err != nil {
		return Manifest{}, fmt.Errorf("verify completed backup archive: %w", err)
	}
	_ = os.RemoveAll(verified.directory)
	if err := os.Rename(temporaryPath, options.ArchivePath); err != nil {
		return Manifest{}, fmt.Errorf("publish verified backup archive: %w", err)
	}
	return manifest, nil
}

func Verify(ctx context.Context, archivePath string) (Manifest, error) {
	extracted, err := extractAndVerify(ctx, archivePath)
	if err != nil {
		return Manifest{}, err
	}
	defer os.RemoveAll(extracted.directory)
	return extracted.manifest, nil
}

func Restore(ctx context.Context, options RestoreOptions) (Manifest, error) {
	if err := requireNewPath(options.DatabasePath, "restore target"); err != nil {
		return Manifest{}, err
	}
	extracted, err := extractAndVerify(ctx, options.ArchivePath)
	if err != nil {
		return Manifest{}, err
	}
	defer os.RemoveAll(extracted.directory)

	supported, err := supportedMigrationVersions()
	if err != nil {
		return Manifest{}, err
	}
	snapshotMigrations := extracted.manifest.Database.SchemaMigrations
	if len(snapshotMigrations) > len(supported) {
		return Manifest{}, fmt.Errorf("snapshot has %d migrations but this build supports %d", len(snapshotMigrations), len(supported))
	}
	for index, version := range snapshotMigrations {
		if version != supported[index] {
			return Manifest{}, fmt.Errorf("snapshot migration ledger %v is not a supported prefix of %v", snapshotMigrations, supported)
		}
	}

	targetDirectory := filepath.Dir(options.DatabasePath)
	if err := os.MkdirAll(targetDirectory, archiveDirectoryMode); err != nil {
		return Manifest{}, fmt.Errorf("create restore directory: %w", err)
	}
	temporary, err := os.CreateTemp(targetDirectory, ".zoomigo-restore-*.db")
	if err != nil {
		return Manifest{}, fmt.Errorf("create temporary restore database: %w", err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return Manifest{}, fmt.Errorf("close temporary restore database: %w", err)
	}
	defer removeDatabaseFiles(temporaryPath)
	if err := copyFile(extracted.databasePath, temporaryPath); err != nil {
		return Manifest{}, err
	}

	db, err := database.Open(ctx, "file:"+filepath.ToSlash(temporaryPath))
	if err != nil {
		return Manifest{}, fmt.Errorf("open isolated restore database: %w", err)
	}
	closeDatabase := func() error {
		if _, checkpointErr := db.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); checkpointErr != nil {
			_ = db.Close()
			return fmt.Errorf("checkpoint restored database: %w", checkpointErr)
		}
		if closeErr := db.Close(); closeErr != nil {
			return fmt.Errorf("close restored database: %w", closeErr)
		}
		return nil
	}
	if err := database.Migrate(ctx, db); err != nil {
		_ = db.Close()
		return Manifest{}, fmt.Errorf("forward migrate restored database: %w", err)
	}
	if err := checkDatabase(ctx, db); err != nil {
		_ = db.Close()
		return Manifest{}, fmt.Errorf("verify restored database: %w", err)
	}
	counts, err := readCounts(ctx, db)
	if err != nil {
		_ = db.Close()
		return Manifest{}, err
	}
	if counts != extracted.manifest.Counts {
		_ = db.Close()
		return Manifest{}, fmt.Errorf("restored validation counts changed: got %+v, want %+v", counts, extracted.manifest.Counts)
	}
	if err := closeDatabase(); err != nil {
		return Manifest{}, err
	}
	if err := os.Chmod(temporaryPath, archiveFileMode); err != nil {
		return Manifest{}, fmt.Errorf("secure restored database: %w", err)
	}
	if err := os.Rename(temporaryPath, options.DatabasePath); err != nil {
		return Manifest{}, fmt.Errorf("publish restored database: %w", err)
	}
	return extracted.manifest, nil
}

type databaseInspection struct {
	sqliteVersion    string
	schemaMigrations []int
	counts           ValidationCounts
}

func inspectDatabase(ctx context.Context, path string) (databaseInspection, error) {
	db, err := sql.Open("sqlite", readOnlyDatabaseURL(path))
	if err != nil {
		return databaseInspection{}, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := db.PingContext(ctx); err != nil {
		return databaseInspection{}, err
	}
	if err := checkDatabase(ctx, db); err != nil {
		return databaseInspection{}, err
	}
	var inspection databaseInspection
	if err := db.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&inspection.sqliteVersion); err != nil {
		return databaseInspection{}, fmt.Errorf("read sqlite version: %w", err)
	}
	inspection.schemaMigrations, err = readSchemaMigrations(ctx, db)
	if err != nil {
		return databaseInspection{}, err
	}
	inspection.counts, err = readCounts(ctx, db)
	if err != nil {
		return databaseInspection{}, err
	}
	return inspection, nil
}

func checkDatabase(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, "PRAGMA integrity_check")
	if err != nil {
		return fmt.Errorf("run sqlite integrity check: %w", err)
	}
	defer rows.Close()
	found := false
	for rows.Next() {
		found = true
		var result string
		if err := rows.Scan(&result); err != nil {
			return fmt.Errorf("read sqlite integrity result: %w", err)
		}
		if result != "ok" {
			return fmt.Errorf("sqlite integrity check failed: %s", result)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate sqlite integrity results: %w", err)
	}
	if !found {
		return errors.New("sqlite integrity check returned no result")
	}

	foreignKeys, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return fmt.Errorf("run sqlite foreign key check: %w", err)
	}
	defer foreignKeys.Close()
	if foreignKeys.Next() {
		return errors.New("sqlite foreign key check found violations")
	}
	return foreignKeys.Err()
}

func readSchemaMigrations(ctx context.Context, db *sql.DB) ([]int, error) {
	rows, err := db.QueryContext(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, fmt.Errorf("read schema migrations: %w", err)
	}
	defer rows.Close()
	var versions []int
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("scan schema migration: %w", err)
		}
		versions = append(versions, version)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate schema migrations: %w", err)
	}
	return versions, nil
}

func readCounts(ctx context.Context, db *sql.DB) (ValidationCounts, error) {
	counts := ValidationCounts{}
	queries := []struct {
		name        string
		destination *int64
	}{
		{"clubs", &counts.Clubs},
		{"teams", &counts.Teams},
		{"players", &counts.Players},
		{"training_entries", &counts.TrainingEntries},
		{"reactions", &counts.Reactions},
	}
	for _, query := range queries {
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+query.name).Scan(query.destination); err != nil {
			return ValidationCounts{}, fmt.Errorf("count %s: %w", query.name, err)
		}
	}
	return counts, nil
}

type archiveEntry struct {
	name string
	// Exactly one of contents or sourcePath is set.
	contents   []byte
	sourcePath string
}

func writeTarGzArchive(path string, entries []archiveEntry, modifiedAt time.Time) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_TRUNC, archiveFileMode)
	if err != nil {
		return fmt.Errorf("open temporary archive: %w", err)
	}
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	fail := func(err error) error {
		_ = file.Close()
		return err
	}
	for _, entry := range entries {
		size := int64(len(entry.contents))
		if entry.sourcePath != "" {
			info, err := os.Stat(entry.sourcePath)
			if err != nil {
				return fail(err)
			}
			size = info.Size()
		}
		if err := tarWriter.WriteHeader(&tar.Header{Name: entry.name, Mode: archiveFileMode, Size: size, ModTime: modifiedAt}); err != nil {
			return fail(fmt.Errorf("write archive entry %q: %w", entry.name, err))
		}
		if entry.sourcePath == "" {
			if _, err := tarWriter.Write(entry.contents); err != nil {
				return fail(fmt.Errorf("write archive entry %q: %w", entry.name, err))
			}
			continue
		}
		source, err := os.Open(entry.sourcePath)
		if err != nil {
			return fail(err)
		}
		_, copyErr := io.Copy(tarWriter, source)
		if closeErr := source.Close(); copyErr == nil {
			copyErr = closeErr
		}
		if copyErr != nil {
			return fail(fmt.Errorf("write archive entry %q: %w", entry.name, copyErr))
		}
	}
	if err := tarWriter.Close(); err != nil {
		return fail(fmt.Errorf("finish tar archive: %w", err))
	}
	if err := gzipWriter.Close(); err != nil {
		return fail(fmt.Errorf("finish compressed archive: %w", err))
	}
	if err := file.Sync(); err != nil {
		return fail(fmt.Errorf("sync archive: %w", err))
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close archive: %w", err)
	}
	return nil
}

// extractTarGzArchive extracts only the entries named in allowed, each within
// its size limit, into a fresh temporary directory.
func extractTarGzArchive(archivePath string, allowed map[string]int64, subdirectories []string) (string, map[string]bool, error) {
	directory, err := os.MkdirTemp("", "zoomigo-archive-verify-*")
	if err != nil {
		return "", nil, fmt.Errorf("create verification directory: %w", err)
	}
	fail := func(err error) (string, map[string]bool, error) {
		_ = os.RemoveAll(directory)
		return "", nil, err
	}
	for _, name := range subdirectories {
		if err := os.Mkdir(filepath.Join(directory, name), archiveDirectoryMode); err != nil {
			return fail(fmt.Errorf("create verification subdirectory: %w", err))
		}
	}
	file, err := os.Open(archivePath)
	if err != nil {
		return fail(fmt.Errorf("open archive: %w", err))
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fail(fmt.Errorf("open compressed archive: %w", err))
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	seen := map[string]bool{}
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fail(fmt.Errorf("read archive: %w", err))
		}
		maximum, permitted := allowed[header.Name]
		if !permitted || seen[header.Name] || header.Typeflag != tar.TypeReg {
			return fail(fmt.Errorf("archive contains an unexpected entry %q", header.Name))
		}
		if header.Size < 0 || header.Size > maximum {
			return fail(fmt.Errorf("archive entry %q has invalid size %d", header.Name, header.Size))
		}
		destination, err := os.OpenFile(filepath.Join(directory, filepath.FromSlash(header.Name)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode)
		if err != nil {
			return fail(fmt.Errorf("create extracted entry: %w", err))
		}
		written, copyErr := io.CopyN(destination, tarReader, header.Size)
		if closeErr := destination.Close(); copyErr == nil {
			copyErr = closeErr
		}
		if copyErr != nil || written != header.Size {
			return fail(fmt.Errorf("extract archive entry %q: %w", header.Name, copyErr))
		}
		seen[header.Name] = true
	}
	return directory, seen, nil
}

func extractAndVerify(ctx context.Context, archivePath string) (extractedArchive, error) {
	if strings.TrimSpace(archivePath) == "" {
		return extractedArchive{}, errors.New("archive path is required")
	}
	expected := map[string]int64{
		manifestName:  maxManifestBytes,
		databaseName:  maxDatabaseBytes,
		checksumsName: maxChecksumsBytes,
	}
	directory, seen, err := extractTarGzArchive(archivePath, expected, nil)
	if err != nil {
		return extractedArchive{}, err
	}
	fail := func(err error) (extractedArchive, error) {
		_ = os.RemoveAll(directory)
		return extractedArchive{}, err
	}
	for name := range expected {
		if !seen[name] {
			return fail(fmt.Errorf("backup is missing %q", name))
		}
	}

	manifestBytes, err := os.ReadFile(filepath.Join(directory, manifestName))
	if err != nil {
		return fail(err)
	}
	checksumsBytes, err := os.ReadFile(filepath.Join(directory, checksumsName))
	if err != nil {
		return fail(err)
	}
	checksums, err := parseChecksums(checksumsBytes)
	if err != nil {
		return fail(err)
	}
	databasePath := filepath.Join(directory, databaseName)
	databaseHash, databaseBytes, err := hashFile(databasePath)
	if err != nil {
		return fail(err)
	}
	if checksums[databaseName] != databaseHash || checksums[manifestName] != hashBytes(manifestBytes) {
		return fail(errors.New("backup checksum validation failed"))
	}

	var manifest Manifest
	decoder := json.NewDecoder(strings.NewReader(string(manifestBytes)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return fail(fmt.Errorf("decode backup manifest: %w", err))
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return fail(errors.New("backup manifest contains trailing data"))
	}
	if err := validateManifest(manifest, databaseHash, databaseBytes); err != nil {
		return fail(err)
	}
	inspection, err := inspectDatabase(ctx, databasePath)
	if err != nil {
		return fail(fmt.Errorf("inspect backup database: %w", err))
	}
	if !equalInts(inspection.schemaMigrations, manifest.Database.SchemaMigrations) {
		return fail(fmt.Errorf("backup migration ledger differs from manifest: got %v, want %v", inspection.schemaMigrations, manifest.Database.SchemaMigrations))
	}
	if inspection.counts != manifest.Counts {
		return fail(fmt.Errorf("backup validation counts differ from manifest: got %+v, want %+v", inspection.counts, manifest.Counts))
	}
	return extractedArchive{directory: directory, manifest: manifest, databasePath: databasePath}, nil
}

func validateManifest(manifest Manifest, databaseHash string, databaseBytes int64) error {
	if manifest.FormatVersion != FormatVersion {
		return fmt.Errorf("unsupported backup format version %d", manifest.FormatVersion)
	}
	if _, err := time.Parse(time.RFC3339, manifest.CreatedAt); err != nil {
		return fmt.Errorf("backup creation timestamp is invalid: %w", err)
	}
	if strings.TrimSpace(manifest.ApplicationVersion) == "" {
		return errors.New("backup application version is required")
	}
	if manifest.Encrypted {
		return errors.New("encrypted backups are not supported by this build")
	}
	if manifest.Database.Engine != databaseEngine || manifest.Database.Path != databaseName {
		return errors.New("backup database metadata is unsupported")
	}
	if manifest.Database.SQLiteVersion == "" {
		return errors.New("backup sqlite version is required")
	}
	if manifest.Database.SHA256 != databaseHash || manifest.Database.Bytes != databaseBytes {
		return errors.New("backup database metadata does not match its contents")
	}
	if !sort.IntsAreSorted(manifest.Database.SchemaMigrations) {
		return errors.New("backup migrations are not sorted")
	}
	for index, version := range manifest.Database.SchemaMigrations {
		if version <= 0 || index > 0 && version == manifest.Database.SchemaMigrations[index-1] {
			return errors.New("backup migration ledger is invalid")
		}
	}
	return nil
}

func parseChecksums(contents []byte) (map[string]string, error) {
	checksums := make(map[string]string, 2)
	for _, line := range strings.Split(strings.TrimSpace(string(contents)), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 || (fields[1] != databaseName && fields[1] != manifestName) {
			return nil, errors.New("backup checksum file is invalid")
		}
		if !isHexDigest(fields[0]) {
			return nil, errors.New("backup checksum has an invalid digest")
		}
		if _, exists := checksums[fields[1]]; exists {
			return nil, errors.New("backup checksum file contains duplicates")
		}
		checksums[fields[1]] = strings.ToLower(fields[0])
	}
	if len(checksums) != 2 {
		return nil, errors.New("backup checksum file is incomplete")
	}
	return checksums, nil
}

func supportedMigrationVersions() ([]int, error) {
	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		return nil, fmt.Errorf("read supported migrations: %w", err)
	}
	var versions []int
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".up.sql") || len(name) < 6 {
			continue
		}
		version, err := strconv.Atoi(name[:6])
		if err != nil {
			return nil, fmt.Errorf("parse supported migration %q: %w", name, err)
		}
		versions = append(versions, version)
	}
	sort.Ints(versions)
	if len(versions) == 0 {
		return nil, errors.New("no supported migrations are embedded")
	}
	return versions, nil
}

func requireNewPath(path, label string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("%s path is required", label)
	}
	_, err := os.Stat(path)
	if err == nil {
		return fmt.Errorf("%s already exists", label)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect %s path: %w", label, err)
	}
	return nil
}

func hashFile(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, fmt.Errorf("open file for hashing: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, fmt.Errorf("hash file: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), written, nil
}

func hashBytes(contents []byte) string {
	hash := sha256.Sum256(contents)
	return hex.EncodeToString(hash[:])
}

func isHexDigest(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func copyFile(sourcePath, destinationPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open snapshot for restore: %w", err)
	}
	defer source.Close()
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_TRUNC, archiveFileMode)
	if err != nil {
		return fmt.Errorf("open temporary restore target: %w", err)
	}
	if _, err := io.Copy(destination, source); err != nil {
		_ = destination.Close()
		return fmt.Errorf("copy snapshot for restore: %w", err)
	}
	if err := destination.Sync(); err != nil {
		_ = destination.Close()
		return fmt.Errorf("sync restored snapshot: %w", err)
	}
	if err := destination.Close(); err != nil {
		return fmt.Errorf("close restored snapshot: %w", err)
	}
	return nil
}

func removeDatabaseFiles(path string) {
	_ = os.Remove(path)
	_ = os.Remove(path + "-wal")
	_ = os.Remove(path + "-shm")
}

func readOnlyDatabaseURL(path string) string {
	return "file:" + filepath.ToSlash(path) + "?mode=ro"
}

func equalInts(left, right []int) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
