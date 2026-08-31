import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
        rates?: { inputHz?: number };
        pointer?: { grabRadiusPx?: number };
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
  transientActions: [] as Array<{
    action: string;
    target: string;
    payload: Record<string, string>;
  }>,
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
    submitTransientAction(action: {
      action: string;
      target: string;
      payload: Record<string, string>;
    }) {
      runtime.transientActions.push(action);
      return { result: Promise.resolve({ accepted: true }) };
    }
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
    runtime.transientActions = [];
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

  it("keeps local motion and its grab overlay at 60 Hz", async () => {
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
    ).toEqual([expect.objectContaining({ maxEntities: 200, maxHz: 60 })]);
    expect(runtime.options?.rates).toEqual({ inputHz: 60 });
    expect(runtime.options?.pointer).toEqual(
      expect.objectContaining({ grabRadiusPx: 44 }),
    );
    await waitFor(() =>
      expect(
        container.querySelector(".team-lounge__shared-avatar"),
      ).toBeVisible(),
    );
    expect(
      container.querySelector(".team-lounge__shared-avatar .avatar"),
    ).toBeNull();
    expect(
      container.querySelector(".team-lounge__avatar-grab-target"),
    ).toHaveAccessibleName("Mason C., you");
    expect(
      container.querySelector(".team-lounge__avatar-grab-target"),
    ).toHaveAttribute("title", "Drag to move your avatar");
  });

  it("relays the larger avatar handle to Canvas without making the stage unscrollable", async () => {
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
    const stage = container.querySelector(".team-lounge__stage");
    const canvas = document.createElement("canvas");
    const received = vi.fn();
    canvas.addEventListener("pointerdown", received);
    stage?.appendChild(canvas);

    const handle = await screen.findByRole("button", {
      name: "Mason C., you",
    });
    const pointerDown = new PointerEvent("pointerdown", {
      pointerId: 12,
      pointerType: "touch",
      clientX: 30,
      clientY: 40,
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(received).toHaveBeenCalledTimes(1);
    expect(canvas.style.touchAction).toBe("pan-y");
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

  it("sends a new quick phrase as soon as the previous send is accepted", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Send Hi! quick message" }),
    );
    await act(async () => undefined);
    act(() => {
      runtime.effectObserver?.({
        effect: "zoomigo.quickPhrase",
        params: { playerId: mason.id, phrase: "hi" },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    const nextPhrase = screen.getByRole("button", {
      name: "Send Bye! quick message",
    });
    expect(nextPhrase).toBeEnabled();
    fireEvent.click(nextPhrase);
    expect(runtime.transientActions).toHaveLength(2);

    act(() => {
      runtime.effectObserver?.({
        effect: "zoomigo.quickPhrase",
        params: { playerId: mason.id, phrase: "bye" },
      });
    });
    expect(
      container.querySelector(".team-lounge__avatar-phrase"),
    ).toHaveTextContent("Bye!");
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
    expect(
      container.querySelectorAll(".team-lounge__goal-confetti i"),
    ).toHaveLength(100);
    expect(container.querySelector('[role="status"]')).toHaveTextContent(
      "100 goals! Counter reset to 00.",
    );
  });

  it("shows the cannon fuse while the system ball is held for launch", async () => {
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
            id: "cannon-one",
            kind: "item",
            definitionId: "zoomigo-prop-play-ball-cannon",
            x: 75,
            y: 98,
            rotation: 0,
            scale: 1,
            ownerUserId: mason.id,
            itemRevision: 1,
            behaviorState: {},
          },
        ],
      });
      runtime.projectionSubscriptions[0]?.observer({
        entities: [
          {
            entityId: "cannon-one",
            definitionId: "zoomigo-prop-play-ball-cannon",
            screen: { x: 180, y: 260 },
            world: { x: 75, y: 98 },
            inViewport: true,
            rotation: 0,
          },
        ],
      });
    });
    await waitFor(() =>
      expect(
        container.querySelector('[aria-label^="Ball cannon item"]'),
      ).toBeVisible(),
    );

    act(() => {
      runtime.effectObserver?.({
        entityId: "cannon-one",
        effect: "lounge.cannon-fuse",
        params: { target: "boardwalk-beach-ball", durationSeconds: 0.8 },
      });
    });
    expect(container.querySelector('[data-cannon-fuse="true"]')).toBeVisible();

    act(() => {
      runtime.effectObserver?.({
        entityId: "cannon-one",
        effect: "lounge.cannon",
        params: { target: "boardwalk-beach-ball", speed: 50 },
      });
    });
    expect(container.querySelector('[data-cannon-fuse="true"]')).toBeNull();
  });
});
