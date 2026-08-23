import { afterEach, describe, expect, it, vi } from "vitest";

import { createPrototypeReward } from "../../../../data/team-reward-prototype";
import {
  cancelConnectedTeamReward,
  createAndPublishTeamReward,
} from "./team-reward-console-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("staff team reward gateway", () => {
  it("creates the draft before publishing its server id", async () => {
    const draft = createPrototypeReward(
      "team-one",
      new Date("2026-08-23T12:00:00Z"),
    );
    const created = { ...draft, id: "reward-server" };
    const published = {
      ...created,
      status: "active",
      progress: {
        current: 0,
        target: 10,
        percent: 0,
        close: false,
        achieved: false,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse(published, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAndPublishTeamReward("team-one", draft),
    ).resolves.toEqual(published);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/staff/api/backend/v1/staff/teams/team-one/rewards",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/staff/api/backend/v1/staff/teams/team-one/rewards/reward-server/publish",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancels through the staff gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);

    await cancelConnectedTeamReward("team-one", "reward-one");

    expect(fetchMock).toHaveBeenCalledWith(
      "/staff/api/backend/v1/staff/teams/team-one/rewards/reward-one/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uploads a canonicalizable image before attaching it to the draft", async () => {
    const draft = {
      ...createPrototypeReward("team-one", new Date("2026-08-23T12:00:00Z")),
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
      imageAltKind: "team_experience" as const,
    };
    const media = {
      id: "media-one",
      teamId: "team-one",
      mimeType: "image/jpeg",
      width: 1200,
      height: 800,
      byteSize: 1000,
      altKind: "team_experience",
      createdAt: "2026-08-23T12:00:00Z",
    };
    const created = { ...draft, id: "reward-server", mediaId: media.id };
    const published = {
      ...created,
      status: "active",
      progress: {
        current: 0,
        target: 10,
        percent: 0,
        close: false,
        achieved: false,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(media, 201))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse(published, 200));
    vi.stubGlobal("fetch", fetchMock);

    await createAndPublishTeamReward("team-one", draft);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/staff/api/backend/v1/staff/teams/team-one/reward-media",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ mediaId: "media-one" });
  });
});

function jsonResponse(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
