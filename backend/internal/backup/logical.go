package backup

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	_ "modernc.org/sqlite"
)

const (
	// Versions the file layout and encoding, not the schema; schema growth is
	// absorbed by the per-field defaults in logical_schema.go.
	LogicalFormatVersion = 1
	// Distinguishes this from the SQLite snapshot archive, which shares the envelope.
	LogicalKind = "zoomigo.logical-export"

	logicalTableDirectory = "tables"
	logicalTableExtension = ".jsonl"
	maxLogicalTableBytes  = 8 << 30
	maxLogicalRowBytes    = 1 << 20
)

type LogicalExportOptions struct {
	DatabaseURL        string
	ArchivePath        string
	ApplicationVersion string
	Now                func() time.Time
}

type LogicalImportOptions struct {
	ArchivePath  string
	DatabasePath string
}

type LogicalManifest struct {
	FormatVersion      int                    `json:"formatVersion"`
	Kind               string                 `json:"kind"`
	CreatedAt          string                 `json:"createdAt"`
	ApplicationVersion string                 `json:"applicationVersion"`
	Source             LogicalSource          `json:"source"`
	Tables             []LogicalTableManifest `json:"tables"`
}

// Provenance only; import never reads it, which is what keeps the format
// decoupled from the exporting build's layout.
type LogicalSource struct {
	Engine           string `json:"engine"`
	SQLiteVersion    string `json:"sqliteVersion"`
	SchemaMigrations []int  `json:"schemaMigrations"`
}

type LogicalTableManifest struct {
	Name    string   `json:"name"`
	Path    string   `json:"path"`
	Fields  []string `json:"fields"`
	OrderBy []string `json:"orderBy"`
	Rows    int64    `json:"rows"`
	SHA256  string   `json:"sha256"`
	Bytes   int64    `json:"bytes"`
}

type extractedLogicalArchive struct {
	directory string
	manifest  LogicalManifest
}

// ExportLogical writes a versioned, engine-independent export of every table.
func ExportLogical(ctx context.Context, options LogicalExportOptions) (LogicalManifest, error) {
	if strings.TrimSpace(options.DatabaseURL) == "" {
		return LogicalManifest{}, errors.New("database URL is required")
	}
	if err := requireNewPath(options.ArchivePath, "export"); err != nil {
		return LogicalManifest{}, err
	}
	archiveDirectory := filepath.Dir(options.ArchivePath)
	if err := os.MkdirAll(archiveDirectory, archiveDirectoryMode); err != nil {
		return LogicalManifest{}, fmt.Errorf("create export directory: %w", err)
	}
	workingDirectory, err := os.MkdirTemp(archiveDirectory, ".zoomigo-export-create-*")
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("create export work directory: %w", err)
	}
	defer os.RemoveAll(workingDirectory)
	if err := os.Mkdir(filepath.Join(workingDirectory, logicalTableDirectory), archiveDirectoryMode); err != nil {
		return LogicalManifest{}, fmt.Errorf("create export table directory: %w", err)
	}

	db, err := database.Open(ctx, options.DatabaseURL)
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("open source database: %w", err)
	}
	defer db.Close()
	// A deferred transaction holds one read snapshot across every table.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("begin export snapshot: %w", err)
	}
	defer tx.Rollback()

	source, err := readLogicalSource(ctx, tx)
	if err != nil {
		return LogicalManifest{}, err
	}
	present, err := readPresentTables(ctx, tx)
	if err != nil {
		return LogicalManifest{}, err
	}

	tableManifests := make([]LogicalTableManifest, 0, len(logicalTables))
	for _, table := range logicalTables {
		if !present[table.Name] {
			continue
		}
		columns, err := readPresentColumns(ctx, tx, table.Name)
		if err != nil {
			return LogicalManifest{}, err
		}
		fields := make([]logicalField, 0, len(table.Fields))
		for _, field := range table.Fields {
			if columns[field.Name] {
				fields = append(fields, field)
			}
		}
		if len(fields) == 0 {
			return LogicalManifest{}, fmt.Errorf("table %q has no exportable fields", table.Name)
		}
		relativePath := logicalTableDirectory + "/" + table.Name + logicalTableExtension
		destinationPath := filepath.Join(workingDirectory, filepath.FromSlash(relativePath))
		rows, err := writeLogicalTable(ctx, tx, table, fields, destinationPath)
		if err != nil {
			return LogicalManifest{}, err
		}
		digest, size, err := hashFile(destinationPath)
		if err != nil {
			return LogicalManifest{}, err
		}
		tableManifests = append(tableManifests, LogicalTableManifest{
			Name:    table.Name,
			Path:    relativePath,
			Fields:  fieldNames(fields),
			OrderBy: table.OrderBy,
			Rows:    rows,
			SHA256:  digest,
			Bytes:   size,
		})
	}
	if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return LogicalManifest{}, fmt.Errorf("close export snapshot: %w", err)
	}

	now := time.Now
	if options.Now != nil {
		now = options.Now
	}
	createdAt := now().UTC()
	applicationVersion := strings.TrimSpace(options.ApplicationVersion)
	if applicationVersion == "" {
		applicationVersion = defaultAppVersion
	}
	manifest := LogicalManifest{
		FormatVersion:      LogicalFormatVersion,
		Kind:               LogicalKind,
		CreatedAt:          createdAt.Format(time.RFC3339),
		ApplicationVersion: applicationVersion,
		Source:             source,
		Tables:             tableManifests,
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("encode export manifest: %w", err)
	}
	manifestBytes = append(manifestBytes, '\n')

	entries := make([]archiveEntry, 0, len(tableManifests)+2)
	entries = append(entries, archiveEntry{name: manifestName, contents: manifestBytes})
	var checksums strings.Builder
	fmt.Fprintf(&checksums, "%s  %s\n", hashBytes(manifestBytes), manifestName)
	for _, table := range tableManifests {
		entries = append(entries, archiveEntry{
			name:       table.Path,
			sourcePath: filepath.Join(workingDirectory, filepath.FromSlash(table.Path)),
		})
		fmt.Fprintf(&checksums, "%s  %s\n", table.SHA256, table.Path)
	}
	entries = append(entries, archiveEntry{name: checksumsName, contents: []byte(checksums.String())})

	temporaryArchive, err := os.CreateTemp(archiveDirectory, ".zoomigo-export-*.tmp")
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("create temporary export: %w", err)
	}
	temporaryPath := temporaryArchive.Name()
	if err := temporaryArchive.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return LogicalManifest{}, fmt.Errorf("close temporary export: %w", err)
	}
	defer os.Remove(temporaryPath)
	if err := writeTarGzArchive(temporaryPath, entries, createdAt); err != nil {
		return LogicalManifest{}, err
	}
	verified, err := extractAndVerifyLogical(temporaryPath)
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("verify completed export: %w", err)
	}
	_ = os.RemoveAll(verified.directory)
	if err := os.Rename(temporaryPath, options.ArchivePath); err != nil {
		return LogicalManifest{}, fmt.Errorf("publish verified export: %w", err)
	}
	return manifest, nil
}

// VerifyLogical proves an export is internally consistent without a database.
func VerifyLogical(ctx context.Context, archivePath string) (LogicalManifest, error) {
	extracted, err := extractAndVerifyLogical(archivePath)
	if err != nil {
		return LogicalManifest{}, err
	}
	defer os.RemoveAll(extracted.directory)
	for _, table := range extracted.manifest.Tables {
		if err := readLogicalRows(extracted.directory, table, func(int64, map[string]json.RawMessage) error {
			return ctx.Err()
		}); err != nil {
			return LogicalManifest{}, err
		}
	}
	return extracted.manifest, nil
}

// ImportLogical loads an export into a new database at the current schema. The
// current schema alone decides field presence and defaults, so older exports fit.
func ImportLogical(ctx context.Context, options LogicalImportOptions) (LogicalManifest, error) {
	if err := requireNewPath(options.DatabasePath, "import target"); err != nil {
		return LogicalManifest{}, err
	}
	extracted, err := extractAndVerifyLogical(options.ArchivePath)
	if err != nil {
		return LogicalManifest{}, err
	}
	defer os.RemoveAll(extracted.directory)

	targetDirectory := filepath.Dir(options.DatabasePath)
	if err := os.MkdirAll(targetDirectory, archiveDirectoryMode); err != nil {
		return LogicalManifest{}, fmt.Errorf("create import directory: %w", err)
	}
	temporary, err := os.CreateTemp(targetDirectory, ".zoomigo-import-*.db")
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("create temporary import database: %w", err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return LogicalManifest{}, fmt.Errorf("close temporary import database: %w", err)
	}
	// Let the driver create the file so it is a valid database, not a zero-byte one.
	if err := os.Remove(temporaryPath); err != nil {
		return LogicalManifest{}, fmt.Errorf("clear temporary import database: %w", err)
	}
	defer removeDatabaseFiles(temporaryPath)

	db, err := database.Open(ctx, "file:"+filepath.ToSlash(temporaryPath))
	if err != nil {
		return LogicalManifest{}, fmt.Errorf("open isolated import database: %w", err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		_ = db.Close()
		return LogicalManifest{}, fmt.Errorf("migrate import database to the current schema: %w", err)
	}
	if err := loadLogicalTables(ctx, db, extracted); err != nil {
		_ = db.Close()
		return LogicalManifest{}, err
	}
	if err := checkDatabase(ctx, db); err != nil {
		_ = db.Close()
		return LogicalManifest{}, fmt.Errorf("verify imported database: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		_ = db.Close()
		return LogicalManifest{}, fmt.Errorf("checkpoint imported database: %w", err)
	}
	if err := db.Close(); err != nil {
		return LogicalManifest{}, fmt.Errorf("close imported database: %w", err)
	}
	if err := os.Chmod(temporaryPath, archiveFileMode); err != nil {
		return LogicalManifest{}, fmt.Errorf("secure imported database: %w", err)
	}
	if err := os.Rename(temporaryPath, options.DatabasePath); err != nil {
		return LogicalManifest{}, fmt.Errorf("publish imported database: %w", err)
	}
	return extracted.manifest, nil
}

func VerifyLogicalEncrypted(ctx context.Context, encryptedPath, identityText string) (LogicalManifest, error) {
	plainPath, err := decryptArchiveToTemporary(encryptedPath, identityText)
	if err != nil {
		return LogicalManifest{}, err
	}
	defer os.Remove(plainPath)
	return VerifyLogical(ctx, plainPath)
}

func ImportLogicalEncrypted(ctx context.Context, options LogicalImportOptions, identityText string) (LogicalManifest, error) {
	plainPath, err := decryptArchiveToTemporary(options.ArchivePath, identityText)
	if err != nil {
		return LogicalManifest{}, err
	}
	defer os.Remove(plainPath)
	options.ArchivePath = plainPath
	return ImportLogical(ctx, options)
}

func readLogicalSource(ctx context.Context, tx *sql.Tx) (LogicalSource, error) {
	source := LogicalSource{Engine: databaseEngine}
	if err := tx.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&source.SQLiteVersion); err != nil {
		return LogicalSource{}, fmt.Errorf("read sqlite version: %w", err)
	}
	rows, err := tx.QueryContext(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return LogicalSource{}, fmt.Errorf("read schema migrations: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return LogicalSource{}, fmt.Errorf("scan schema migration: %w", err)
		}
		source.SchemaMigrations = append(source.SchemaMigrations, version)
	}
	if err := rows.Err(); err != nil {
		return LogicalSource{}, fmt.Errorf("iterate schema migrations: %w", err)
	}
	if len(source.SchemaMigrations) == 0 {
		return LogicalSource{}, errors.New("source database has no applied migrations")
	}
	return source, nil
}

func readPresentTables(ctx context.Context, tx *sql.Tx) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, "SELECT name FROM sqlite_master WHERE type = 'table'")
	if err != nil {
		return nil, fmt.Errorf("read source tables: %w", err)
	}
	defer rows.Close()
	present := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan source table: %w", err)
		}
		present[name] = true
	}
	return present, rows.Err()
}

func readPresentColumns(ctx context.Context, tx *sql.Tx, table string) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, "SELECT name FROM pragma_table_info(?)", table)
	if err != nil {
		return nil, fmt.Errorf("read columns of %s: %w", table, err)
	}
	defer rows.Close()
	columns := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan column of %s: %w", table, err)
		}
		columns[name] = true
	}
	return columns, rows.Err()
}

func writeLogicalTable(ctx context.Context, tx *sql.Tx, table logicalTable, fields []logicalField, destinationPath string) (int64, error) {
	file, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode)
	if err != nil {
		return 0, fmt.Errorf("create %s export file: %w", table.Name, err)
	}
	defer file.Close()
	writer := bufio.NewWriter(file)

	query := fmt.Sprintf(
		"SELECT %s FROM %s ORDER BY %s",
		strings.Join(quoteIdentifiers(fieldNames(fields)), ", "),
		quoteIdentifier(table.Name),
		strings.Join(quoteIdentifiers(table.OrderBy), ", "),
	)
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", table.Name, err)
	}
	defer rows.Close()

	var written int64
	var line bytes.Buffer
	for rows.Next() {
		destinations := make([]any, len(fields))
		for index, field := range fields {
			destinations[index] = scanDestination(field.Kind)
		}
		if err := rows.Scan(destinations...); err != nil {
			return 0, fmt.Errorf("scan %s row: %w", table.Name, err)
		}
		line.Reset()
		line.WriteByte('{')
		for index, field := range fields {
			if index > 0 {
				line.WriteByte(',')
			}
			encodedName, err := json.Marshal(field.Name)
			if err != nil {
				return 0, err
			}
			line.Write(encodedName)
			line.WriteByte(':')
			encodedValue, err := encodeScannedValue(table.Name, field, destinations[index])
			if err != nil {
				return 0, err
			}
			line.Write(encodedValue)
		}
		line.WriteString("}\n")
		if line.Len() > maxLogicalRowBytes {
			return 0, fmt.Errorf("%s row %d exceeds the %d byte row limit", table.Name, written, maxLogicalRowBytes)
		}
		if _, err := writer.Write(line.Bytes()); err != nil {
			return 0, fmt.Errorf("write %s row: %w", table.Name, err)
		}
		written++
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate %s: %w", table.Name, err)
	}
	if err := writer.Flush(); err != nil {
		return 0, fmt.Errorf("flush %s export file: %w", table.Name, err)
	}
	if err := file.Sync(); err != nil {
		return 0, fmt.Errorf("sync %s export file: %w", table.Name, err)
	}
	return written, nil
}

func scanDestination(kind fieldKind) any {
	switch kind {
	case fieldInteger:
		return new(sql.NullInt64)
	case fieldReal:
		return new(sql.NullFloat64)
	case fieldBlob:
		return new([]byte)
	default:
		return new(sql.NullString)
	}
}

func encodeScannedValue(table string, field logicalField, destination any) ([]byte, error) {
	nullValue := func() ([]byte, error) {
		if !field.Nullable {
			return nil, fmt.Errorf("%s.%s is NULL but the export schema declares it required", table, field.Name)
		}
		return []byte("null"), nil
	}
	switch value := destination.(type) {
	case *sql.NullInt64:
		if !value.Valid {
			return nullValue()
		}
		return json.Marshal(value.Int64)
	case *sql.NullFloat64:
		if !value.Valid {
			return nullValue()
		}
		return json.Marshal(value.Float64)
	case *[]byte:
		if *value == nil {
			return nullValue()
		}
		return json.Marshal(base64.StdEncoding.EncodeToString(*value))
	case *sql.NullString:
		if !value.Valid {
			return nullValue()
		}
		return json.Marshal(value.String)
	default:
		return nil, fmt.Errorf("%s.%s has an unsupported destination", table, field.Name)
	}
}

func loadLogicalTables(ctx context.Context, db *sql.DB, extracted extractedLogicalArchive) error {
	byName := make(map[string]LogicalTableManifest, len(extracted.manifest.Tables))
	for _, table := range extracted.manifest.Tables {
		byName[table.Name] = table
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin import: %w", err)
	}
	defer tx.Rollback()

	// assignment_catalog is itself seeded and points at activity_definitions,
	// so clearing and reinserting both in declaration order would check the
	// foreign key mid-transaction, before activity_definitions is repopulated.
	// Deferring the check to commit, same as SQLite's documented answer for
	// exactly this shape, means statement order inside the transaction no
	// longer matters.
	if _, err := tx.ExecContext(ctx, "PRAGMA defer_foreign_keys = ON"); err != nil {
		return fmt.Errorf("defer foreign keys for import: %w", err)
	}

	for _, table := range logicalTables {
		descriptor, exported := byName[table.Name]
		if !exported {
			continue
		}
		if table.Seeded {
			// Migration-seeded rows would otherwise collide with or outlive the export's.
			if _, err := tx.ExecContext(ctx, "DELETE FROM "+quoteIdentifier(table.Name)); err != nil {
				return fmt.Errorf("clear seeded %s before import: %w", table.Name, err)
			}
		}
		if err := insertLogicalTable(ctx, tx, extracted.directory, table, descriptor); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func insertLogicalTable(ctx context.Context, tx *sql.Tx, directory string, table logicalTable, descriptor LogicalTableManifest) error {
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(table.Fields)), ", ")
	statement, err := tx.PrepareContext(ctx, fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		quoteIdentifier(table.Name),
		strings.Join(quoteIdentifiers(fieldNames(table.Fields)), ", "),
		placeholders,
	))
	if err != nil {
		return fmt.Errorf("prepare %s insert: %w", table.Name, err)
	}
	defer statement.Close()

	exported := map[string]bool{}
	for _, name := range descriptor.Fields {
		exported[name] = true
	}
	return readLogicalRows(directory, descriptor, func(number int64, row map[string]json.RawMessage) error {
		values := make([]any, len(table.Fields))
		for index, field := range table.Fields {
			raw, present := row[field.Name]
			if !present {
				if !field.HasDefault {
					return fmt.Errorf("%s row %d is missing required field %q", table.Name, number, field.Name)
				}
				values[index] = field.Default
				continue
			}
			value, err := decodeFieldValue(table.Name, field, raw)
			if err != nil {
				return fmt.Errorf("%s row %d: %w", table.Name, number, err)
			}
			values[index] = value
		}
		if _, err := statement.ExecContext(ctx, values...); err != nil {
			return fmt.Errorf("insert %s row %d: %w", table.Name, number, err)
		}
		return nil
	})
}

func decodeFieldValue(table string, field logicalField, raw json.RawMessage) (any, error) {
	if string(bytes.TrimSpace(raw)) == "null" {
		if !field.Nullable {
			return nil, fmt.Errorf("field %q is null but this build requires a value", field.Name)
		}
		return nil, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	switch field.Kind {
	case fieldInteger:
		var number json.Number
		if err := decoder.Decode(&number); err != nil {
			return nil, fmt.Errorf("field %q is not a number: %w", field.Name, err)
		}
		value, err := number.Int64()
		if err != nil {
			return nil, fmt.Errorf("field %q is not an integer: %w", field.Name, err)
		}
		return value, nil
	case fieldReal:
		var number json.Number
		if err := decoder.Decode(&number); err != nil {
			return nil, fmt.Errorf("field %q is not a number: %w", field.Name, err)
		}
		value, err := number.Float64()
		if err != nil {
			return nil, fmt.Errorf("field %q is not a real number: %w", field.Name, err)
		}
		return value, nil
	case fieldBlob:
		var encoded string
		if err := decoder.Decode(&encoded); err != nil {
			return nil, fmt.Errorf("field %q is not a base64 string: %w", field.Name, err)
		}
		value, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("field %q is not valid base64: %w", field.Name, err)
		}
		return value, nil
	default:
		var value string
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf("field %q is not a string: %w", field.Name, err)
		}
		return value, nil
	}
}

// readLogicalRows enforces the manifest's row count and exact field set per row.
func readLogicalRows(directory string, descriptor LogicalTableManifest, visit func(number int64, row map[string]json.RawMessage) error) error {
	file, err := os.Open(filepath.Join(directory, filepath.FromSlash(descriptor.Path)))
	if err != nil {
		return fmt.Errorf("open %s export file: %w", descriptor.Name, err)
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLogicalRowBytes)
	var number int64
	for scanner.Scan() {
		number++
		if number > descriptor.Rows {
			return fmt.Errorf("%s has more rows than the manifest declares (%d)", descriptor.Name, descriptor.Rows)
		}
		row := map[string]json.RawMessage{}
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		if err := decoder.Decode(&row); err != nil {
			return fmt.Errorf("decode %s row %d: %w", descriptor.Name, number, err)
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			return fmt.Errorf("%s row %d contains trailing data", descriptor.Name, number)
		}
		if len(row) != len(descriptor.Fields) {
			return fmt.Errorf("%s row %d has %d fields, but the manifest declares %d", descriptor.Name, number, len(row), len(descriptor.Fields))
		}
		for _, name := range descriptor.Fields {
			if _, present := row[name]; !present {
				return fmt.Errorf("%s row %d is missing declared field %q", descriptor.Name, number, name)
			}
		}
		if err := visit(number, row); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read %s export file: %w", descriptor.Name, err)
	}
	if number != descriptor.Rows {
		return fmt.Errorf("%s has %d rows but the manifest declares %d", descriptor.Name, number, descriptor.Rows)
	}
	return nil
}

func extractAndVerifyLogical(archivePath string) (extractedLogicalArchive, error) {
	if strings.TrimSpace(archivePath) == "" {
		return extractedLogicalArchive{}, errors.New("export path is required")
	}
	allowed := map[string]int64{
		manifestName:  maxManifestBytes,
		checksumsName: maxChecksumsBytes,
	}
	for _, table := range logicalTables {
		allowed[logicalTableDirectory+"/"+table.Name+logicalTableExtension] = maxLogicalTableBytes
	}
	directory, seen, err := extractTarGzArchive(archivePath, allowed, []string{logicalTableDirectory})
	if err != nil {
		return extractedLogicalArchive{}, err
	}
	fail := func(err error) (extractedLogicalArchive, error) {
		_ = os.RemoveAll(directory)
		return extractedLogicalArchive{}, err
	}
	for _, required := range []string{manifestName, checksumsName} {
		if !seen[required] {
			return fail(fmt.Errorf("export is missing %q", required))
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
	checksums, err := parseLogicalChecksums(checksumsBytes, seen)
	if err != nil {
		return fail(err)
	}
	if checksums[manifestName] != hashBytes(manifestBytes) {
		return fail(errors.New("export manifest does not match its checksum"))
	}

	var manifest LogicalManifest
	decoder := json.NewDecoder(bytes.NewReader(manifestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return fail(fmt.Errorf("decode export manifest: %w", err))
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return fail(errors.New("export manifest contains trailing data"))
	}
	if err := validateLogicalManifest(manifest, directory, checksums, seen); err != nil {
		return fail(err)
	}
	return extractedLogicalArchive{directory: directory, manifest: manifest}, nil
}

func validateLogicalManifest(manifest LogicalManifest, directory string, checksums map[string]string, seen map[string]bool) error {
	if manifest.FormatVersion != LogicalFormatVersion {
		return fmt.Errorf("unsupported logical export format version %d", manifest.FormatVersion)
	}
	if manifest.Kind != LogicalKind {
		return fmt.Errorf("archive kind %q is not a logical export", manifest.Kind)
	}
	if _, err := time.Parse(time.RFC3339, manifest.CreatedAt); err != nil {
		return fmt.Errorf("export creation timestamp is invalid: %w", err)
	}
	if strings.TrimSpace(manifest.ApplicationVersion) == "" {
		return errors.New("export application version is required")
	}
	if manifest.Source.Engine != databaseEngine || manifest.Source.SQLiteVersion == "" {
		return errors.New("export source metadata is unsupported")
	}
	if len(manifest.Source.SchemaMigrations) == 0 || !sort.IntsAreSorted(manifest.Source.SchemaMigrations) {
		return errors.New("export migration ledger is invalid")
	}
	if len(manifest.Tables) == 0 {
		return errors.New("export declares no tables")
	}

	declared := map[string]bool{}
	previousIndex := -1
	for _, descriptor := range manifest.Tables {
		table, known := logicalTableByName(descriptor.Name)
		if !known {
			return fmt.Errorf("export contains table %q, which this build does not know; it was produced by a newer build", descriptor.Name)
		}
		if declared[descriptor.Name] {
			return fmt.Errorf("export declares table %q twice", descriptor.Name)
		}
		declared[descriptor.Name] = true
		index := logicalTableIndex(descriptor.Name)
		if index <= previousIndex {
			return fmt.Errorf("export table %q is out of dependency order", descriptor.Name)
		}
		previousIndex = index
		if descriptor.Path != logicalTableDirectory+"/"+descriptor.Name+logicalTableExtension {
			return fmt.Errorf("export table %q has an unexpected path %q", descriptor.Name, descriptor.Path)
		}
		if !seen[descriptor.Path] {
			return fmt.Errorf("export is missing %q", descriptor.Path)
		}
		if len(descriptor.Fields) == 0 {
			return fmt.Errorf("export table %q declares no fields", descriptor.Name)
		}
		fields := map[string]bool{}
		for _, name := range descriptor.Fields {
			if _, known := table.field(name); !known {
				return fmt.Errorf("export table %q contains field %q, which this build cannot store; it was produced by a newer build", descriptor.Name, name)
			}
			if fields[name] {
				return fmt.Errorf("export table %q declares field %q twice", descriptor.Name, name)
			}
			fields[name] = true
		}
		for _, field := range table.Fields {
			if !fields[field.Name] && !field.HasDefault {
				return fmt.Errorf("export table %q omits required field %q and this build has no default for it", descriptor.Name, field.Name)
			}
		}
		if strings.Join(descriptor.OrderBy, ",") != strings.Join(table.OrderBy, ",") {
			return fmt.Errorf("export table %q declares ordering %v, want %v", descriptor.Name, descriptor.OrderBy, table.OrderBy)
		}
		if descriptor.Rows < 0 || descriptor.Bytes < 0 {
			return fmt.Errorf("export table %q has invalid counts", descriptor.Name)
		}
		digest, size, err := hashFile(filepath.Join(directory, filepath.FromSlash(descriptor.Path)))
		if err != nil {
			return err
		}
		if digest != descriptor.SHA256 || size != descriptor.Bytes {
			return fmt.Errorf("export table %q does not match its manifest digest", descriptor.Name)
		}
		if checksums[descriptor.Path] != digest {
			return fmt.Errorf("export table %q does not match its checksum", descriptor.Name)
		}
	}
	for name := range seen {
		if name == manifestName || name == checksumsName {
			continue
		}
		if !declared[strings.TrimSuffix(strings.TrimPrefix(name, logicalTableDirectory+"/"), logicalTableExtension)] {
			return fmt.Errorf("export contains %q, which its manifest does not declare", name)
		}
	}
	return nil
}

func parseLogicalChecksums(contents []byte, seen map[string]bool) (map[string]string, error) {
	checksums := make(map[string]string, len(seen))
	for _, line := range strings.Split(strings.TrimSpace(string(contents)), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			return nil, errors.New("export checksum file is invalid")
		}
		if fields[1] == checksumsName || !seen[fields[1]] {
			return nil, fmt.Errorf("export checksum names %q, which the archive does not contain", fields[1])
		}
		if !isHexDigest(fields[0]) {
			return nil, errors.New("export checksum has an invalid digest")
		}
		if _, exists := checksums[fields[1]]; exists {
			return nil, errors.New("export checksum file contains duplicates")
		}
		checksums[fields[1]] = strings.ToLower(fields[0])
	}
	if len(checksums) != len(seen)-1 {
		return nil, errors.New("export checksum file is incomplete")
	}
	return checksums, nil
}

func logicalTableIndex(name string) int {
	for index, table := range logicalTables {
		if table.Name == name {
			return index
		}
	}
	return -1
}

func fieldNames(fields []logicalField) []string {
	names := make([]string, len(fields))
	for index, field := range fields {
		names[index] = field.Name
	}
	return names
}

// Defence in depth; every identifier here comes from the compiled-in schema.
func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func quoteIdentifiers(names []string) []string {
	quoted := make([]string, len(names))
	for index, name := range names {
		quoted[index] = quoteIdentifier(name)
	}
	return quoted
}
