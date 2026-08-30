import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAvatar } from "../avatar/config";
import type { Player } from "../domain/types";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

const runtime = vi.hoisted(() => ({
  options: undefined as
    | {
        assets?: { id: string };
        definitions?: Array<{
          definitionId: string;
          visual: { spriteId?: string };
        }>;
        scene?: {
          projectEntityVisual?: (entity: {
            kind: string;
            userId?: string;
          }) => unknown;
        };
      }
    | undefined,
  projectionSubscriptions: [] as Array<{
    observer(snapshot: {
      entities: Array<{
        entityId: string;
        definitionId?: string;
        screen: { x: number; y: number };
        world: { x: number; y: number };
        inViewport: boolean;
        rotation?: number;
      }>;
    }): void;
    options: {
      entityIds?: readonly string[];
      maxEntities?: number;
      maxHz?: number;
    };
  }>,
  canonicalObserver: undefined as
    | ((snapshot: {
        entities: Array<{
          id: string;
          kind: "item";
          definitionId: string;
          x: number;
          y: number;
          rotation: number;
          scale: number;
          ownerUserId: string;
          itemRevision: number;
          behaviorState: unknown;
        }>;
      }) => void)
    | undefined,
  effectObserver: undefined as
    | ((effect: {
        entityId?: string;
        effect: string;
        params?: Record<string, unknown>;
      }) => void)
    | undefined,
  errorObserver: undefined as ((error: unknown) => void) | undefined,
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class {
    constructor(
      options: NonNullable<typeof runtime.options> & {
        onError(error: unknown): void;
      },
    ) {
      runtime.options = options;
      const { onError } = options;
      runtime.errorObserver = onError;
    }
    subscribePresence() {
      return () => undefined;
    }
    subscribeCanonicalState(observer: typeof runtime.canonicalObserver) {
      runtime.canonicalObserver = observer;
      return () => undefined;
    }
    subscribeOverlayProjection(
      observer: (typeof runtime.projectionSubscriptions)[number]["observer"],
      options: (typeof runtime.projectionSubscriptions)[number]["options"],
    ) {
      runtime.projectionSubscriptions.push({ observer, options });
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
    runtime.options = undefined;
    runtime.projectionSubscriptions = [];
    runtime.canonicalObserver = undefined;
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

  it("reports lost room ownership as a recoverable handoff", async () => {
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
        details: { serverCode: "room_ownership_lost" },
      });
    });

    expect(onStateChange).toHaveBeenLastCalledWith("ownership-lost");
  });

  it("uses the bounded projection only for UI overlays", async () => {
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

    await waitFor(() =>
      expect(runtime.projectionSubscriptions).toHaveLength(1),
    );
    expect(
      runtime.projectionSubscriptions.map(({ options }) => options),
    ).toEqual([expect.objectContaining({ maxEntities: 200, maxHz: 30 })]);
    await waitFor(() =>
      expect(
        container.querySelector(".team-lounge__shared-avatar"),
      ).toBeVisible(),
    );
    expect(
      container.querySelector(".team-lounge__shared-avatar .avatar"),
    ).toBeNull();
  });

  it("gives participant and item artwork to the Pixi renderer", async () => {
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

    await waitFor(() => expect(runtime.options).toBeDefined());
    expect(runtime.options?.assets?.id).toContain("pixi-presentation");
    expect(
      runtime.options?.definitions?.find(
        ({ definitionId }) => definitionId === "zoomigo-prop-play-wobble-cone",
      )?.visual.spriteId,
    ).toBe("lounge.item.zoomigo-prop-play-wobble-cone");
    expect(
      runtime.options?.scene?.projectEntityVisual?.({
        kind: "avatar",
        userId: mason.id,
      }),
    ).toEqual({ variant: "participant-0" });
    expect(
      container.querySelector(".team-lounge__shared-avatar .avatar"),
    ).toBeNull();
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

  it("projects the durable goal score and celebrates its hundredth goal", async () => {
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

    await waitFor(() => {
      expect(runtime.canonicalObserver).toBeDefined();
      expect(runtime.projectionSubscriptions).toHaveLength(1);
    });
    act(() => {
      runtime.canonicalObserver?.({
        entities: [
          {
            id: "goal-one",
            kind: "item",
            definitionId: "zoomigo-prop-play-mini-goal",
            x: 40,
            y: 60,
            rotation: 0,
            scale: 1,
            ownerUserId: mason.id,
            itemRevision: 1,
            behaviorState: {
              elapsedTicks: 0,
              cooldownUntil: [],
              goalScore: 7,
            },
          },
        ],
      });
      runtime.projectionSubscriptions[0]?.observer({
        entities: [
          {
            entityId: "goal-one",
            definitionId: "zoomigo-prop-play-mini-goal",
            screen: { x: 140, y: 190 },
            world: { x: 40, y: 60 },
            inViewport: true,
            rotation: 0,
          },
        ],
      });
    });

    expect(
      container.querySelector(".team-lounge__goal-counter"),
    ).toHaveTextContent("07");
    act(() => {
      runtime.effectObserver?.({
        entityId: "goal-one",
        effect: "lounge.goal-confetti",
        params: { score: 0 },
      });
    });
    expect(
      container.querySelector(".team-lounge__goal-confetti"),
    ).toBeVisible();
    expect(container.querySelector('[role="status"]')).toHaveTextContent(
      "100 goals! Counter reset to 00.",
    );
  });
});
