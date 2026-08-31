package rewardmedia

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"math"
)

const (
	MaxUploadBytes  = 3 << 20
	MaxDimension    = 2048
	MaxPixels       = 4_000_000
	DisplayWidth    = 1200
	DisplayHeight   = 800
	ThumbnailWidth  = 360
	ThumbnailHeight = 240
	maxDisplayBytes = 1 << 20
)

var (
	ErrUploadTooLarge  = errors.New("reward image upload is too large")
	ErrInvalidImage    = errors.New("reward image is invalid")
	ErrImageDimensions = errors.New("reward image dimensions are not allowed")
	ErrProcessingBusy  = errors.New("reward image processing was cancelled")
)

type Result struct {
	Display    []byte
	Thumbnail  []byte
	MIMEType   string
	Width      int
	Height     int
	ByteSize   int64
	SHA256     string
	SourceMIME string
}

type Processor struct {
	decodeSlot chan struct{}
}

func NewProcessor() *Processor {
	return &Processor{decodeSlot: make(chan struct{}, 1)}
}

func (processor *Processor) Process(input []byte) (Result, error) {
	return processor.ProcessContext(context.Background(), input)
}

func (processor *Processor) ProcessContext(ctx context.Context, input []byte) (Result, error) {
	if len(input) == 0 {
		return Result{}, ErrInvalidImage
	}
	if len(input) > MaxUploadBytes {
		return Result{}, ErrUploadTooLarge
	}
	select {
	case processor.decodeSlot <- struct{}{}:
		defer func() { <-processor.decodeSlot }()
	case <-ctx.Done():
		return Result{}, ErrProcessingBusy
	}

	config, format, err := image.DecodeConfig(bytes.NewReader(input))
	if err != nil || (format != "jpeg" && format != "png") {
		return Result{}, ErrInvalidImage
	}
	if config.Width < 1 || config.Height < 1 || config.Width > MaxDimension || config.Height > MaxDimension || config.Width*config.Height > MaxPixels {
		return Result{}, ErrImageDimensions
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(input))
	if err != nil || decodedFormat != format {
		return Result{}, ErrInvalidImage
	}
	orientation := uint16(1)
	if format == "jpeg" {
		orientation = jpegOrientation(input)
	}
	oriented := applyOrientation(decoded, orientation)
	displayPixels := resizeCenterCrop(oriented, DisplayWidth, DisplayHeight)
	thumbnailPixels := resizeCenterCrop(oriented, ThumbnailWidth, ThumbnailHeight)
	display, err := encodeBoundedJPEG(displayPixels)
	if err != nil {
		return Result{}, err
	}
	var thumbnail bytes.Buffer
	if err := jpeg.Encode(&thumbnail, thumbnailPixels, &jpeg.Options{Quality: 82}); err != nil {
		return Result{}, ErrInvalidImage
	}
	digest := sha256.Sum256(display)
	return Result{
		Display: display, Thumbnail: thumbnail.Bytes(), MIMEType: "image/jpeg",
		Width: DisplayWidth, Height: DisplayHeight, ByteSize: int64(len(display)),
		SHA256:     hex.EncodeToString(digest[:]),
		SourceMIME: "image/" + format,
	}, nil
}

func encodeBoundedJPEG(value image.Image) ([]byte, error) {
	for _, quality := range []int{86, 78, 70, 62} {
		var encoded bytes.Buffer
		if err := jpeg.Encode(&encoded, value, &jpeg.Options{Quality: quality}); err != nil {
			return nil, ErrInvalidImage
		}
		if encoded.Len() <= maxDisplayBytes {
			return encoded.Bytes(), nil
		}
	}
	return nil, ErrInvalidImage
}

func applyOrientation(source image.Image, orientation uint16) image.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outputWidth, outputHeight := width, height
	if orientation >= 5 && orientation <= 8 {
		outputWidth, outputHeight = height, width
	}
	result := image.NewNRGBA(image.Rect(0, 0, outputWidth, outputHeight))
	for y := 0; y < outputHeight; y++ {
		for x := 0; x < outputWidth; x++ {
			sourceX, sourceY := orientedSourcePoint(x, y, width, height, orientation)
			result.Set(x, y, source.At(bounds.Min.X+sourceX, bounds.Min.Y+sourceY))
		}
	}
	return result
}

func orientedSourcePoint(x, y, width, height int, orientation uint16) (int, int) {
	switch orientation {
	case 2:
		return width - 1 - x, y
	case 3:
		return width - 1 - x, height - 1 - y
	case 4:
		return x, height - 1 - y
	case 5:
		return y, x
	case 6:
		return y, height - 1 - x
	case 7:
		return width - 1 - y, height - 1 - x
	case 8:
		return width - 1 - y, x
	default:
		return x, y
	}
}

func resizeCenterCrop(source image.Image, targetWidth, targetHeight int) *image.NRGBA {
	bounds := source.Bounds()
	sourceWidth, sourceHeight := bounds.Dx(), bounds.Dy()
	cropX, cropY, cropWidth, cropHeight := 0, 0, sourceWidth, sourceHeight
	if sourceWidth*targetHeight > sourceHeight*targetWidth {
		cropWidth = sourceHeight * targetWidth / targetHeight
		cropX = (sourceWidth - cropWidth) / 2
	} else {
		cropHeight = sourceWidth * targetHeight / targetWidth
		cropY = (sourceHeight - cropHeight) / 2
	}
	result := image.NewNRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	for y := 0; y < targetHeight; y++ {
		sourceY := float64(cropY) + (float64(y)+0.5)*float64(cropHeight)/float64(targetHeight) - 0.5
		for x := 0; x < targetWidth; x++ {
			sourceX := float64(cropX) + (float64(x)+0.5)*float64(cropWidth)/float64(targetWidth) - 0.5
			result.SetNRGBA(x, y, bilinearPixel(source, bounds, sourceX, sourceY))
		}
	}
	return result
}

func bilinearPixel(source image.Image, bounds image.Rectangle, x, y float64) color.NRGBA {
	x = math.Max(0, math.Min(float64(bounds.Dx()-1), x))
	y = math.Max(0, math.Min(float64(bounds.Dy()-1), y))
	x0, y0 := int(math.Floor(x)), int(math.Floor(y))
	x1, y1 := min(x0+1, bounds.Dx()-1), min(y0+1, bounds.Dy()-1)
	fx, fy := x-float64(x0), y-float64(y0)
	pixels := [4]color.NRGBA{
		flattenedPixel(source.At(bounds.Min.X+x0, bounds.Min.Y+y0)),
		flattenedPixel(source.At(bounds.Min.X+x1, bounds.Min.Y+y0)),
		flattenedPixel(source.At(bounds.Min.X+x0, bounds.Min.Y+y1)),
		flattenedPixel(source.At(bounds.Min.X+x1, bounds.Min.Y+y1)),
	}
	interpolate := func(component func(color.NRGBA) uint8) uint8 {
		top := float64(component(pixels[0]))*(1-fx) + float64(component(pixels[1]))*fx
		bottom := float64(component(pixels[2]))*(1-fx) + float64(component(pixels[3]))*fx
		return uint8(math.Round(top*(1-fy) + bottom*fy))
	}
	return color.NRGBA{
		R: interpolate(func(pixel color.NRGBA) uint8 { return pixel.R }),
		G: interpolate(func(pixel color.NRGBA) uint8 { return pixel.G }),
		B: interpolate(func(pixel color.NRGBA) uint8 { return pixel.B }), A: 255,
	}
}

func flattenedPixel(value color.Color) color.NRGBA {
	r, g, b, alpha := value.RGBA()
	const background = uint32(0xf5f7ff)
	backgroundR, backgroundG, backgroundB := (background>>16)&0xff, (background>>8)&0xff, background&0xff
	composite := func(channel uint32, backdrop uint32) uint8 {
		result := channel + backdrop*257*(0xffff-alpha)/0xffff
		return uint8(min(result, uint32(0xffff)) >> 8)
	}
	return color.NRGBA{R: composite(r, backgroundR), G: composite(g, backgroundG), B: composite(b, backgroundB), A: 255}
}

func jpegOrientation(contents []byte) uint16 {
	for offset := 2; offset+4 <= len(contents) && contents[offset] == 0xff; {
		marker := contents[offset+1]
		if marker == 0xda || marker == 0xd9 {
			break
		}
		length := int(binary.BigEndian.Uint16(contents[offset+2 : offset+4]))
		if length < 2 || offset+2+length > len(contents) {
			break
		}
		if marker == 0xe1 {
			segment := contents[offset+4 : offset+2+length]
			if orientation := exifOrientation(segment); orientation >= 1 && orientation <= 8 {
				return orientation
			}
		}
		offset += 2 + length
	}
	return 1
}

func exifOrientation(segment []byte) uint16 {
	if len(segment) < 14 || !bytes.Equal(segment[:6], []byte{'E', 'x', 'i', 'f', 0, 0}) {
		return 0
	}
	tiff := segment[6:]
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 0
	}
	if order.Uint16(tiff[2:4]) != 42 {
		return 0
	}
	ifdOffset := int(order.Uint32(tiff[4:8]))
	if ifdOffset < 0 || ifdOffset+2 > len(tiff) {
		return 0
	}
	count := int(order.Uint16(tiff[ifdOffset : ifdOffset+2]))
	for index := 0; index < count; index++ {
		entry := ifdOffset + 2 + index*12
		if entry+12 > len(tiff) {
			return 0
		}
		if order.Uint16(tiff[entry:entry+2]) == 0x0112 && order.Uint16(tiff[entry+2:entry+4]) == 3 && order.Uint32(tiff[entry+4:entry+8]) == 1 {
			return order.Uint16(tiff[entry+8 : entry+10])
		}
	}
	return 0
}
