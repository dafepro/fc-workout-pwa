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

export interface RewardImagePlatform {
  decode(blob: Blob): Promise<DecodedRewardImage>;
  encode(
    decoded: DecodedRewardImage,
    width: number,
    height: number,
    maximumBytes: number,
  ): Promise<Blob>;
  dataURL(blob: Blob): Promise<string>;
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
  maximumBytes: number,
  platform: RewardImagePlatform = browserRewardImagePlatform,
) {
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
      target.resized || file.size > maximumBytes
        ? await platform.encode(
            decoded,
            target.width,
            target.height,
            maximumBytes,
          )
        : file;
    if (prepared.size > maximumBytes) {
      throw new RewardImagePreparationError("too_large");
    }
    return await platform.dataURL(prepared);
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
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
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
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new RewardImagePreparationError("invalid");
    context.fillStyle = "#f5f7ff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= maximumBytes) return blob;
    }
    throw new RewardImagePreparationError("too_large");
  },
  dataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(blob);
    });
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
