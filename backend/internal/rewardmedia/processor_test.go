package rewardmedia_test

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
)

func TestProcessorCanonicalizesPixelsAndStripsInputFormat(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 900, 600))
	for y := 0; y < source.Bounds().Dy(); y++ {
		for x := 0; x < source.Bounds().Dx(); x++ {
			source.Set(x, y, color.NRGBA{R: uint8(x % 255), G: uint8(y % 255), B: 90, A: 180})
		}
	}
	var upload bytes.Buffer
	if err := png.Encode(&upload, source); err != nil {
		t.Fatal(err)
	}

	result, err := rewardmedia.NewProcessor().Process(upload.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	assertJPEGDimensions(t, result.Display, 1200, 800)
	assertJPEGDimensions(t, result.Thumbnail, 360, 240)
	if result.MIMEType != "image/jpeg" || result.Width != 1200 || result.Height != 800 {
		t.Fatalf("unexpected canonical metadata: %+v", result)
	}
	if result.SHA256 == "" || result.ByteSize != int64(len(result.Display)) {
		t.Fatalf("missing canonical digest or size: %+v", result)
	}
}

func TestProcessorAppliesJPEGOrientationBeforeCropping(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 400, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 400; x++ {
			if y < 300 {
				source.Set(x, y, color.RGBA{R: 240, A: 255})
			} else {
				source.Set(x, y, color.RGBA{B: 240, A: 255})
			}
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	oriented := injectOrientation(t, encoded.Bytes(), 6)

	result, err := rewardmedia.NewProcessor().Process(oriented)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := jpeg.Decode(bytes.NewReader(result.Display))
	if err != nil {
		t.Fatal(err)
	}
	left := color.RGBAModel.Convert(decoded.At(100, 400)).(color.RGBA)
	right := color.RGBAModel.Convert(decoded.At(1100, 400)).(color.RGBA)
	if left.B < 180 || right.R < 180 {
		t.Fatalf("orientation 6 was not applied: left=%+v right=%+v", left, right)
	}
}

func TestProcessorRejectsUnusableImages(t *testing.T) {
	processor := rewardmedia.NewProcessor()
	oversized := image.NewRGBA(image.Rect(0, 0, 2049, 10))
	var upload bytes.Buffer
	if err := png.Encode(&upload, oversized); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		contents []byte
		want     error
	}{
		"malformed":  {contents: []byte("not an image"), want: rewardmedia.ErrInvalidImage},
		"dimensions": {contents: upload.Bytes(), want: rewardmedia.ErrImageDimensions},
		"byte limit": {contents: bytes.Repeat([]byte{'x'}, rewardmedia.MaxUploadBytes+1), want: rewardmedia.ErrUploadTooLarge},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := processor.Process(test.contents); !errors.Is(err, test.want) {
				t.Fatalf("error = %v, want %v", err, test.want)
			}
		})
	}
}

func assertJPEGDimensions(t *testing.T, contents []byte, width, height int) {
	t.Helper()
	config, format, err := image.DecodeConfig(bytes.NewReader(contents))
	if err != nil {
		t.Fatal(err)
	}
	if format != "jpeg" || config.Width != width || config.Height != height {
		t.Fatalf("canonical image = %s %dx%d, want jpeg %dx%d", format, config.Width, config.Height, width, height)
	}
}

func injectOrientation(t *testing.T, jpegBytes []byte, orientation uint16) []byte {
	t.Helper()
	if len(jpegBytes) < 2 || jpegBytes[0] != 0xff || jpegBytes[1] != 0xd8 {
		t.Fatal("fixture is not a JPEG")
	}
	payload := []byte{
		'E', 'x', 'i', 'f', 0, 0,
		'M', 'M', 0, 42, 0, 0, 0, 8,
		0, 1,
		0x01, 0x12, 0, 3, 0, 0, 0, 1, byte(orientation >> 8), byte(orientation), 0, 0,
		0, 0, 0, 0,
	}
	segment := []byte{0xff, 0xe1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}
	segment = append(segment, payload...)
	result := append([]byte{}, jpegBytes[:2]...)
	result = append(result, segment...)
	return append(result, jpegBytes[2:]...)
}
