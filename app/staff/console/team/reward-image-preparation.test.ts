import { describe, expect, it, vi } from "vitest";

import {
  prepareRewardImage,
  REWARD_IMAGE_TRANSFER_BYTES,
  RewardImagePreparationError,
  rewardImageTargetSize,
  type RewardImagePlatform,
} from "./reward-image-preparation";

describe("reward image preparation", () => {
  it("fits common phone photos inside the backend decode budget", () => {
    expect(rewardImageTargetSize(4032, 3024)).toEqual({
      width: 2048,
      height: 1536,
      resized: true,
    });
    expect(rewardImageTargetSize(9000, 9000)).toEqual({
      width: 2000,
      height: 2000,
      resized: true,
    });
  });

  it("keeps a safe source and creates a disposable preview", async () => {
    const source = new File(["safe"], "prize.png", { type: "image/png" });
    const dispose = vi.fn();
    const platform = platformFor({
      width: 1200,
      height: 800,
      preview: { url: "blob:safe", dispose },
    });

    await expect(prepareRewardImage(source, platform)).resolves.toEqual({
      file: source,
      previewURL: "blob:safe",
      dispose,
    });
    expect(platform.encode).not.toHaveBeenCalled();
  });

  it("downscales and compresses a phone photo before creating the upload", async () => {
    const close = vi.fn();
    const encoded = new Blob(["normalized"], { type: "image/jpeg" });
    const platform = platformFor({
      width: 4032,
      height: 3024,
      close,
      encoded,
      preview: { url: "blob:normalized", dispose: vi.fn() },
    });
    const source = new File(["phone-photo"], "team-prize.png", {
      type: "image/png",
    });

    const prepared = await prepareRewardImage(source, platform);

    expect(platform.encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4032, height: 3024 }),
      2048,
      1536,
      REWARD_IMAGE_TRANSFER_BYTES,
    );
    expect(prepared.file).toBeInstanceOf(File);
    expect(prepared.file.name).toBe("team-prize.jpg");
    expect(prepared.file.type).toBe("image/jpeg");
    expect(prepared.file.size).toBe(encoded.size);
    expect(platform.preview).toHaveBeenCalledWith(prepared.file);
    expect(close).toHaveBeenCalledOnce();
  });

  it("compresses a dimension-safe source that exceeds the transfer budget", async () => {
    const encoded = new Blob(["normalized"], { type: "image/jpeg" });
    const platform = platformFor({ width: 1600, height: 1200, encoded });
    const source = new File(
      [new Uint8Array(REWARD_IMAGE_TRANSFER_BYTES + 1)],
      "large.jpg",
      { type: "image/jpeg" },
    );

    await prepareRewardImage(source, platform);

    expect(platform.encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1600, height: 1200 }),
      1600,
      1200,
      REWARD_IMAGE_TRANSFER_BYTES,
    );
  });

  it("refuses an unreasonable source before decoding it", async () => {
    const platform = platformFor({ width: 10, height: 10 });
    const source = new File(
      [new Uint8Array(12 * 1024 * 1024 + 1)],
      "too-large.jpg",
      { type: "image/jpeg" },
    );

    await expect(prepareRewardImage(source, platform)).rejects.toMatchObject({
      code: "too_large",
    });
    expect(platform.decode).not.toHaveBeenCalled();
  });

  it("normalizes decode and invalid-dimension failures", async () => {
    const decodeFailure = platformFor({ width: 10, height: 10 });
    vi.mocked(decodeFailure.decode).mockRejectedValue(new Error("decode"));
    await expect(
      prepareRewardImage(
        new File(["broken"], "broken.jpg", { type: "image/jpeg" }),
        decodeFailure,
      ),
    ).rejects.toEqual(new RewardImagePreparationError("invalid"));

    const invalidDimensions = platformFor({ width: 0, height: 10 });
    await expect(
      prepareRewardImage(
        new File(["broken"], "broken.jpg", { type: "image/jpeg" }),
        invalidDimensions,
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

function platformFor({
  width,
  height,
  close,
  encoded = new Blob(["encoded"], { type: "image/jpeg" }),
  preview = { url: "blob:preview", dispose: vi.fn() },
}: {
  width: number;
  height: number;
  close?: () => void;
  encoded?: Blob;
  preview?: { url: string; dispose(): void };
}): RewardImagePlatform {
  return {
    decode: vi.fn().mockResolvedValue({
      source: {} as CanvasImageSource,
      width,
      height,
      close,
    }),
    encode: vi.fn().mockResolvedValue(encoded),
    preview: vi.fn().mockReturnValue(preview),
  };
}
