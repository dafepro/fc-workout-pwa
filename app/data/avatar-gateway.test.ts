import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAvatar } from "../avatar/config";
import type { AvatarConfiguration } from "../avatar/types";
import { AvatarGatewayError, createAvatarGateway } from "./avatar-gateway";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("connected avatar gateway", () => {
  it("PUTs the canonical configuration and adopts the server's reply", async () => {
    const serverReply = normalizeAvatar({
      head: "person-tall",
      hat: "cap",
      eyewear: "round",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        configuration: serverReply,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const saved = await createAvatarGateway(true, {}).save({
      head: "person-tall",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/zoomigo/v1/me/avatar");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      configuration: normalizeAvatar({ head: "person-tall" }),
    });
    expect(saved).toEqual(serverReply);
  });

  // The server rejects an absent or null wrapper with a 400 rather than quietly
  // clearing the avatar, so the key has to survive every input we can hand it.
  it("always sends a present configuration wrapper", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json({ configuration: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createAvatarGateway(true, {});

    const inputs: AvatarConfiguration[] = [
      {},
      { frame: "gold" },
      { head: "dragon" },
    ];
    for (const config of inputs) {
      await gateway.save(config);
    }

    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(init.body);
      expect(Object.keys(body)).toEqual(["configuration"]);
      expect(body.configuration).toBeTypeOf("object");
      expect(body.configuration).not.toBeNull();
    }
  });

  it("loads what the session already delivered instead of fetching again", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await createAvatarGateway(true, { head: "player" }).load();

    expect(loaded).toEqual({ head: "player" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's error code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "invalid_avatar_configuration",
              message: "That look is not allowed.",
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      createAvatarGateway(true, {}).save({ head: "dog" }),
    ).rejects.toMatchObject({
      code: "invalid_avatar_configuration",
      message: "That look is not allowed.",
    });
  });

  it("falls back to a safe message when an intermediary returns non-JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<html>502</html>", { status: 502 })),
    );

    await expect(
      createAvatarGateway(true, {}).save({ head: "dog" }),
    ).rejects.toBeInstanceOf(AvatarGatewayError);
  });
});

describe("local avatar gateway", () => {
  it("round-trips through localStorage", async () => {
    const gateway = createAvatarGateway(false, {});

    await gateway.save({
      head: "person-curls",
      backgroundColor: "#112233",
    });

    expect(await createAvatarGateway(false, {}).load()).toEqual(
      normalizeAvatar({
        head: "person-curls",
        backgroundColor: "#112233",
      }),
    );
  });

  it("leaves an empty store invalid so the UI renders initials", async () => {
    expect(await createAvatarGateway(false, {}).load()).toEqual({});
  });

  it("uses its own key so the training-entry store cannot clobber it", async () => {
    window.localStorage.setItem(
      "zoomigo-milestone-1",
      JSON.stringify({ entries: [] }),
    );

    await createAvatarGateway(false, {}).save({ head: "person-curls" });

    expect(
      JSON.parse(window.localStorage.getItem("zoomigo-milestone-1")!),
    ).toEqual({ entries: [] });
    expect(window.localStorage.getItem("zoomigo-avatar")).toContain(
      "person-curls",
    );
  });

  it("leaves a corrupt stored value invalid so the UI renders initials", async () => {
    window.localStorage.setItem("zoomigo-avatar", "{not json");

    expect(await createAvatarGateway(false, {}).load()).toEqual({});
  });
});
