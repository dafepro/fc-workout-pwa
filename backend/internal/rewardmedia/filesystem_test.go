package rewardmedia_test

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
)

func TestFileStoreWritesReadsAndDeletesProtectedRenditions(t *testing.T) {
	root := filepath.Join(t.TempDir(), "reward-media")
	media, err := rewardmedia.NewFileStore(root)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = media.Put(ctx, "media-one", []byte("display"), []byte("thumb")); err != nil {
		t.Fatal(err)
	}
	for variant, want := range map[rewardmedia.Variant]string{
		rewardmedia.DisplayVariant:   "display",
		rewardmedia.ThumbnailVariant: "thumb",
	} {
		reader, openErr := media.Open(ctx, "media-one", variant)
		if openErr != nil {
			t.Fatal(openErr)
		}
		contents, readErr := io.ReadAll(reader)
		_ = reader.Close()
		if readErr != nil || string(contents) != want {
			t.Fatalf("%s contents = %q err=%v", variant, contents, readErr)
		}
	}
	info, err := os.Stat(filepath.Join(root, "media-one", "display.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("media mode = %o, want no group/other permissions", info.Mode().Perm())
	}
	if err = media.Delete(ctx, "media-one"); err != nil {
		t.Fatal(err)
	}
	if _, err = media.Open(ctx, "media-one", rewardmedia.DisplayVariant); !errors.Is(err, rewardmedia.ErrMediaNotFound) {
		t.Fatalf("open after delete = %v, want not found", err)
	}
}

func TestFileStoreRejectsKeysAndVariantsThatCouldEscapeItsRoot(t *testing.T) {
	media, err := rewardmedia.NewFileStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"", "../outside", "nested/file", ".hidden"} {
		if err = media.Put(context.Background(), key, []byte("a"), []byte("b")); !errors.Is(err, rewardmedia.ErrInvalidStorageKey) {
			t.Fatalf("key %q error = %v, want invalid key", key, err)
		}
	}
	if _, err = media.Open(context.Background(), "media-one", rewardmedia.Variant("../secret")); !errors.Is(err, rewardmedia.ErrInvalidVariant) {
		t.Fatalf("variant error = %v, want invalid variant", err)
	}
}
