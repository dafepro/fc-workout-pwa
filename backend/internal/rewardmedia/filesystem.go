package rewardmedia

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
)

type Variant string

const (
	DisplayVariant   Variant = "display"
	ThumbnailVariant Variant = "thumbnail"
)

var (
	ErrInvalidStorageKey = errors.New("invalid reward media storage key")
	ErrInvalidVariant    = errors.New("invalid reward media variant")
	ErrMediaNotFound     = errors.New("reward media file not found")
	storageKeyPattern    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
)

func ValidStorageKey(key string) bool {
	return storageKeyPattern.MatchString(key)
}

type Store interface {
	Put(context.Context, string, []byte, []byte) error
	Open(context.Context, string, Variant) (io.ReadCloser, error)
	Delete(context.Context, string) error
}

type FileStore struct {
	root string
}

func NewStorageKey() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generate reward media key: %w", err)
	}
	return "media_" + hex.EncodeToString(value), nil
}

func NewFileStore(root string) (*FileStore, error) {
	if root == "" {
		return nil, errors.New("reward media root is required")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve reward media root: %w", err)
	}
	if err = os.MkdirAll(absolute, 0o700); err != nil {
		return nil, fmt.Errorf("create reward media root: %w", err)
	}
	if err = os.Chmod(absolute, 0o700); err != nil {
		return nil, fmt.Errorf("protect reward media root: %w", err)
	}
	return &FileStore{root: absolute}, nil
}

func (store *FileStore) Put(ctx context.Context, key string, display, thumbnail []byte) error {
	if !ValidStorageKey(key) {
		return ErrInvalidStorageKey
	}
	if len(display) == 0 || len(thumbnail) == 0 {
		return ErrInvalidImage
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	directory := filepath.Join(store.root, key)
	if err := os.Mkdir(directory, 0o700); err != nil {
		return fmt.Errorf("create reward media directory: %w", err)
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.RemoveAll(directory)
		}
	}()
	if err := writeAtomic(filepath.Join(directory, "display.jpg"), display); err != nil {
		return err
	}
	if err := writeAtomic(filepath.Join(directory, "thumbnail.jpg"), thumbnail); err != nil {
		return err
	}
	complete = true
	return nil
}

func (store *FileStore) Open(ctx context.Context, key string, variant Variant) (io.ReadCloser, error) {
	path, err := store.variantPath(key, variant)
	if err != nil {
		return nil, err
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	reader, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrMediaNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("open reward media: %w", err)
	}
	return reader, nil
}

func (store *FileStore) Delete(ctx context.Context, key string) error {
	if !ValidStorageKey(key) {
		return ErrInvalidStorageKey
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	err := os.RemoveAll(filepath.Join(store.root, key))
	if err != nil {
		return fmt.Errorf("delete reward media: %w", err)
	}
	return nil
}

func (store *FileStore) variantPath(key string, variant Variant) (string, error) {
	if !ValidStorageKey(key) {
		return "", ErrInvalidStorageKey
	}
	name := ""
	switch variant {
	case DisplayVariant:
		name = "display.jpg"
	case ThumbnailVariant:
		name = "thumbnail.jpg"
	default:
		return "", ErrInvalidVariant
	}
	return filepath.Join(store.root, key, name), nil
}

func writeAtomic(path string, contents []byte) error {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".upload-*")
	if err != nil {
		return fmt.Errorf("create temporary reward media: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err = temporary.Chmod(0o600); err == nil {
		_, err = temporary.Write(contents)
	}
	if err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write reward media: %w", err)
	}
	if err = os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("publish reward media: %w", err)
	}
	return nil
}
