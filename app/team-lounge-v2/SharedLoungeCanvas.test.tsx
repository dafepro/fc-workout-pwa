import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

const runtime = vi.hoisted(() => ({
  constructed: 0,
  started: 0,
  stopped: 0,
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class FakeCanvasRuntime {
    constructor() {
      runtime.constructed += 1;
    }

    subscribeLifecycle() {
      return () => undefined;
    }

    subscribePresence() {
      return () => undefined;
    }

    subscribeOverlayProjection() {
      return () => undefined;
    }

    async start() {
      runtime.started += 1;
    }

    async whenPresented() {}

    async stopGracefully() {
      runtime.stopped += 1;
    }

    stop() {
      runtime.stopped += 1;
    }
  },
}));

vi.mock("./data/lounge-gateway", () => ({
  prepareTeamLoungeJoin: vi.fn().mockResolvedValue({
    roomID: "team:team-one:lounge:2026-08-24:v2",
    serverURL: "wss://example.test/canvas",
    credentialProvider: vi.fn(),
  }),
}));

describe("SharedLoungeCanvas", () => {
  beforeEach(() => {
    runtime.constructed = 0;
    runtime.started = 0;
    runtime.stopped = 0;
  });

  it("keeps the room runtime alive when safe roster presentation refreshes", async () => {
    const avatar = defaultAvatar();
    const props = {
      teamID: "team-one",
      playerID: "player-one",
      roster: [
        {
          playerID: "player-one",
          displayName: "Mason C.",
          avatarConfiguration: avatar,
        },
      ],
      onStateChange: vi.fn(),
      onPresenceChange: vi.fn(),
    };
    const view = render(<SharedLoungeCanvas {...props} />);

    await waitFor(() => expect(runtime.started).toBe(1));
    view.rerender(
      <SharedLoungeCanvas
        {...props}
        roster={[
          {
            playerID: "player-one",
            displayName: "Mason C.",
            avatarConfiguration: { ...avatar },
          },
        ]}
      />,
    );

    await waitFor(() => expect(runtime.constructed).toBe(1));
    expect(runtime.stopped).toBe(0);
  });
});
