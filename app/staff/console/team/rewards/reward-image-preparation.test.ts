import { describe, expect, it, vi } from "vitest";

import {
  prepareRewardImage,
  rewardImageTargetSize,
  type RewardImagePlatform,
} from "./reward-image-preparation";

describe("reward image preparation", () => {
  it("fits a common phone photo inside the backend decode budget", () => {
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

  it("leaves an already safe image at its original dimensions", () => {
    expect(rewardImageTargetSize(1200, 800)).toEqual({
      width: 1200,
      height: 800,
      resized: false,
    });
  });

  it("downscales before reading the upload data URL", async () => {
    const close = vi.fn();
    const encoded = new Blob(["safe"], { type: "image/jpeg" });
    const platform: RewardImagePlatform = {
      decode: vi.fn().mockResolvedValue({
        source: {} as CanvasImageSource,
        width: 4032,
        height: 3024,
        close,
      }),
      encode: vi.fn().mockResolvedValue(encoded),
      dataURL: vi.fn().mockResolvedValue("data:image/jpeg;base64,c2FmZQ=="),
    };

    await expect(
      prepareRewardImage(
        new File(["phone-photo"], "photo.jpg", { type: "image/jpeg" }),
        3 * 1024 * 1024,
        platform,
      ),
    ).resolves.toBe("data:image/jpeg;base64,c2FmZQ==");
    expect(platform.encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4032, height: 3024 }),
      2048,
      1536,
      3 * 1024 * 1024,
    );
    expect(platform.dataURL).toHaveBeenCalledWith(encoded);
    expect(close).toHaveBeenCalledOnce();
  });

  it("compresses a normal phone upload that is larger than the server payload limit", async () => {
    const encoded = new Blob(["safe"], { type: "image/jpeg" });
    const platform: RewardImagePlatform = {
      decode: vi.fn().mockResolvedValue({
        source: {} as CanvasImageSource,
        width: 1600,
        height: 1200,
      }),
      encode: vi.fn().mockResolvedValue(encoded),
      dataURL: vi.fn().mockResolvedValue("data:image/jpeg;base64,c2FmZQ=="),
    };
    const phonePhoto = new File(
      [new Uint8Array(4 * 1024 * 1024)],
      "photo.jpg",
      { type: "image/jpeg" },
    );

    await expect(
      prepareRewardImage(phonePhoto, 3 * 1024 * 1024, platform),
    ).resolves.toBe("data:image/jpeg;base64,c2FmZQ==");
    expect(platform.encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1600, height: 1200 }),
      1600,
      1200,
      3 * 1024 * 1024,
    );
  });
});
