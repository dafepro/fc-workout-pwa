import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAvatar } from "../avatar/config";
import type { Player } from "../domain/types";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

const runtime = vi.hoisted(() => ({
  projectionOptions: undefined as
    | { maxEntities?: number; maxHz?: number }
    | undefined,
  effectObserver: undefined as
    | ((effect: { effect: string; params?: Record<string, unknown> }) => void)
    | undefined,
  errorObserver: undefined as ((error: unknown) => void) | undefined,
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class {
    constructor({ onError }: { onError(error: unknown): void }) {
      runtime.errorObserver = onError;
    }
    subscribePresence() {
      return () => undefined;
    }
    subscribeCanonicalState() {
      return () => undefined;
    }
    subscribeOverlayProjection(
      _observer: unknown,
      options: { maxEntities?: number; maxHz?: number },
    ) {
      runtime.projectionOptions = options;
      return () => undefined;
    }
    subscribeLifecycle() {
      return () => undefined;
    }
    subscribeEffects(observer: typeof runtime.effectObserver) {
      runtime.effectObserver = observer;
      return () => undefined;
    }
    projectWorldPoint() {
      return {
        screen: { x: 120, y: 240 },
        inViewport: true,
      };
    }
    async start() {}
    async stopGracefully() {}
    stop() {}
  },
  SimulationDriver: class {},
}));

vi.mock("./lounge-gateway", () => ({
  prepareTeamLoungeJoin: vi.fn().mockResolvedValue({
    roomID: "team:team-one:lounge:2026-08-24:v6",
    serverURL: "https://canvas.example",
    visitorIDs: [],
    placementCredits: 1,
    placementCapacity: 3,
    editableItemIDs: [],
    credentialProvider: vi.fn(),
  }),
  requestTeamLoungeItemMutationPermit: vi.fn(),
  reserveTeamLoungePlacement: vi.fn(),
}));

vi.mock("../data/prize-box-gateway", () => ({
  createPrizeBoxGateway: () => ({ inventory: vi.fn().mockResolvedValue([]) }),
}));

const mason: Player = {
  id: "player-mason",
  firstName: "Mason",
  lastInitial: "C.",
  initials: "MC",
  avatarColor: "#6e56cf",
  weeklySessions: 1,
  effortPoints: 4,
  currentStreak: 1,
  consistency: 1,
};

describe("Shared Lounge Canvas", () => {
  beforeEach(() => {
    runtime.projectionOptions = undefined;
    runtime.effectObserver = undefined;
    runtime.errorObserver = undefined;
    vi.stubGlobal("Worker", class {});
  });

  it("reports a superseded participant session separately from a canvas failure", async () => {
    const onStateChange = vi.fn();
    render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: mason.id, avatarConfig: defaultAvatar() }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason]}
          onStateChange={onStateChange}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    await waitFor(() => expect(runtime.errorObserver).toBeDefined());
    act(() => {
      runtime.errorObserver?.({
        code: "server_rejected",
        source: "protocol",
        recoverable: false,
        details: { serverCode: "session_superseded" },
      });
    });

    expect(onStateChange).toHaveBeenLastCalledWith("superseded");
  });

  it("observes the full bounded Lounge instead of dropping late avatars", async () => {
    const { container } = render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: mason.id, avatarConfig: defaultAvatar() }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason]}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    await waitFor(() => expect(runtime.projectionOptions).toBeDefined());
    expect(runtime.projectionOptions).toMatchObject({
      maxEntities: 200,
      maxHz: 30,
    });
    await waitFor(() =>
      expect(
        container.querySelector(".team-lounge__shared-avatar .avatar"),
      ).toBeVisible(),
    );
  });

  it("shows an allowlisted quick phrase as a transient sender bubble", async () => {
    const { container } = render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: mason.id, avatarConfig: defaultAvatar() }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason]}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    await waitFor(() => expect(runtime.effectObserver).toBeDefined());
    act(() => {
      runtime.effectObserver?.({
        effect: "zoomigo.quickPhrase",
        params: { playerId: mason.id, phrase: "nice" },
      });
    });

    expect(
      container.querySelector(".team-lounge__avatar-phrase"),
    ).toHaveTextContent("Nice!");
  });
});
