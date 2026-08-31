const MAXIMUM_DIMENSION = 2048;
const MAXIMUM_PIXELS = 4_000_000;
const MAXIMUM_SOURCE_BYTES = 12 * 1024 * 1024;

export const REWARD_IMAGE_TRANSFER_BYTES = 750 * 1024;

interface DecodedRewardImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

interface RewardImagePreview {
  url: string;
  dispose(): void;
}

export interface RewardImagePlatform {
  decode(blob: Blob): Promise<DecodedRewardImage>;
  encode(
    decoded: DecodedRewardImage,
    width: number,
    height: number,
    maximumBytes: number,
  ): Promise<Blob>;
  preview(blob: Blob): RewardImagePreview;
}

export interface PreparedRewardImage {
  file: File;
  previewURL: string;
  dispose(): void;
}

export class RewardImagePreparationError extends Error {
  constructor(readonly code: "invalid" | "too_large") {
    super(code);
    this.name = "RewardImagePreparationError";
  }
}

export function rewardImageTargetSize(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new RewardImagePreparationError("invalid");
  }
  const scale = Math.min(
    1,
    MAXIMUM_DIMENSION / width,
    MAXIMUM_DIMENSION / height,
    Math.sqrt(MAXIMUM_PIXELS / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    resized: scale < 1,
  };
}

export async function prepareRewardImage(
  file: File,
  platform: RewardImagePlatform = browserRewardImagePlatform,
): Promise<PreparedRewardImage> {
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    throw new RewardImagePreparationError("invalid");
  }
  if (file.size > MAXIMUM_SOURCE_BYTES) {
    throw new RewardImagePreparationError("too_large");
  }
  let decoded: DecodedRewardImage;
  try {
    decoded = await platform.decode(file);
  } catch {
    throw new RewardImagePreparationError("invalid");
  }
  try {
    const target = rewardImageTargetSize(decoded.width, decoded.height);
    const prepared =
      target.resized || file.size > REWARD_IMAGE_TRANSFER_BYTES
        ? await platform.encode(
            decoded,
            target.width,
            target.height,
            REWARD_IMAGE_TRANSFER_BYTES,
          )
        : file;
    if (prepared.size > REWARD_IMAGE_TRANSFER_BYTES) {
      throw new RewardImagePreparationError("too_large");
    }
    const upload =
      prepared === file
        ? file
        : new File([prepared], jpegName(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
    const preview = platform.preview(upload);
    return {
      file: upload,
      previewURL: preview.url,
      dispose: preview.dispose,
    };
  } catch (error) {
    if (error instanceof RewardImagePreparationError) throw error;
    throw new RewardImagePreparationError("invalid");
  } finally {
    decoded.close?.();
  }
}

const browserRewardImagePlatform: RewardImagePlatform = {
  async decode(blob) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        };
      } catch {
        // Safari's partial createImageBitmap support can reject the options.
      }
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  },
  async encode(decoded, width, height, maximumBytes) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new RewardImagePreparationError("invalid");
    let targetWidth = width;
    let targetHeight = height;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.fillStyle = "#f5f7ff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);
      let smallest: Blob | undefined;
      for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
        const blob = await canvasBlob(canvas, quality);
        if (blob.size <= maximumBytes) return blob;
        smallest = blob;
      }
      if (!smallest) break;
      const scale = Math.min(
        0.85,
        Math.max(0.5, Math.sqrt(maximumBytes / smallest.size) * 0.92),
      );
      targetWidth = Math.max(1, Math.floor(targetWidth * scale));
      targetHeight = Math.max(1, Math.floor(targetHeight * scale));
    }
    throw new RewardImagePreparationError("too_large");
  },
  preview(blob) {
    const url = URL.createObjectURL(blob);
    return { url, dispose: () => URL.revokeObjectURL(url) };
  },
};

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new RewardImagePreparationError("invalid")),
      "image/jpeg",
      quality,
    );
  });
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/u, "").trim() || "reward-image";
  return `${base}.jpg`;
}
