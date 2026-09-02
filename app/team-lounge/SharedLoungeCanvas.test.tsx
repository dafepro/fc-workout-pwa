import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAvatar, normalizeAvatar } from "../avatar/config";
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
        rates?: {
          inputHz?: number;
          deltaHz?: number;
          keyframeHz?: number;
          checkpointHz?: number;
        };
        pointer?: { grabRadiusPx?: number };
        hideDisabledAvatars?: boolean;
      }
    | undefined,
  projectionSubscriptions: [] as Array<{
    observer(snapshot: {
      canvasSize: { width: number; height: number };
      viewport: {
        width: number;
        height: number;
        scale: number;
        offsetX: number;
        offsetY: number;
      };
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
          ownerUserId?: string;
          itemRevision?: number;
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
  presenceObserver: undefined as
    | ((snapshot: {
        participants: Array<{
          userId: string;
          avatarEntityId: string;
          status: "active" | "inactive" | "disconnected";
        }>;
      }) => void)
    | undefined,
  lifecycleObserver: undefined as
    | ((snapshot: {
        state: "active" | "backgrounded" | "reconnecting" | "failed";
      }) => void)
    | undefined,
  transientActions: [] as Array<{
    action: string;
    target: string;
    payload: Record<string, string>;
  }>,
}));
const prizeInventory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

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
    subscribePresence(observer: typeof runtime.presenceObserver) {
      runtime.presenceObserver = observer;
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
    subscribeLifecycle(observer: typeof runtime.lifecycleObserver) {
      runtime.lifecycleObserver = observer;
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
    async start() {
      runtime.projectionSubscriptions.forEach(({ observer }) =>
        observer({
          canvasSize: { width: 100, height: 150 },
          viewport: {
            width: 100,
            height: 150,
            scale: 6.4,
            offsetX: 0,
            offsetY: 0,
          },
          entities: [
            {
              entityId: "avatar:player-mason",
              definitionId: "avatar",
              screen: { x: 120, y: 240 },
              world: { x: 20, y: 40 },
              inViewport: true,
            },
          ],
        }),
      );
    }
    async stopGracefully() {}
    stop() {}
    clearItemEditSelection() {}
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

vi.mock("./lounge-room-transport", () => ({
  createPersistentLoungeTransport: () => ({}),
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
  createConnectedPrizeBoxGateway: () => ({
    inventory: prizeInventory,
  }),
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
    runtime.presenceObserver = undefined;
    runtime.lifecycleObserver = undefined;
    runtime.transientActions = [];
    prizeInventory.mockReset().mockResolvedValue([]);
    window.localStorage.clear();
    vi.stubGlobal("Worker", class {});
  });

  it("keeps the interactive canvas mounted and reports reconnecting in its tray", async () => {
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

    await waitFor(() => expect(runtime.lifecycleObserver).toBeDefined());
    const stage = screen.getByLabelText("Interactive lounge canvas");
    act(() => runtime.lifecycleObserver?.({ state: "reconnecting" }));

    expect(
      container.querySelector(".team-lounge__connection-status"),
    ).toHaveTextContent(
      "Canvas connection interrupted. Movement stays local while we reconnect.",
    );
    expect(screen.getByLabelText("Interactive lounge canvas")).toBe(stage);
    expect(container.querySelector(".team-lounge__playfield")).toBeVisible();

    act(() => runtime.lifecycleObserver?.({ state: "active" }));
    expect(screen.queryByText(/connection interrupted/i)).toBeNull();
    expect(screen.getByLabelText("Interactive lounge canvas")).toBe(stage);
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
    expect(runtime.options?.rates).toEqual({
      inputHz: 60,
      deltaHz: 30,
      keyframeHz: 2,
      checkpointHz: 1,
    });
    expect(runtime.options?.pointer).toEqual(
      expect.objectContaining({ grabRadiusPx: 44 }),
    );
    expect(runtime.options?.hideDisabledAvatars).toBe(false);
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

  it("renders completed offline teammates as drained, paused avatars on the bench", async () => {
    const ava: Player = {
      ...mason,
      id: "player-ava",
      firstName: "Ava",
      lastInitial: "R.",
      initials: "AR",
      avatarConfiguration: normalizeAvatar({
        head: "prism-dragon",
        effect: "orbit",
      }),
      goalStatus: "completed",
      challengeCompleted: true,
    } as Player;
    const { container } = render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: mason.id, avatarConfig: defaultAvatar() }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason, ava]}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    await waitFor(() =>
      expect(runtime.projectionSubscriptions).toHaveLength(1),
    );
    act(() => {
      runtime.projectionSubscriptions[0]?.observer({
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 100,
          height: 150,
          scale: 6.4,
          offsetX: 0,
          offsetY: 0,
        },
        entities: [
          {
            entityId: `avatar:${mason.id}`,
            definitionId: "avatar",
            screen: { x: 120, y: 240 },
            world: { x: 20, y: 40 },
            inViewport: true,
          },
        ],
      });
      runtime.presenceObserver?.({ participants: [] });
    });

    const benchAvatar = await screen.findByRole("img", {
      name: "Ava R., finished and resting on the bench",
    });
    expect(benchAvatar).toHaveAttribute("data-presence", "bench");
    expect(benchAvatar).toHaveStyle({ "--lounge-avatar-size": "61.4px" });
    expect(
      benchAvatar.querySelector(".avatar-head--prism-dragon"),
    ).toBeVisible();
    expect(
      container.querySelector(".team-lounge__avatar-decoration--bench"),
    ).toBeVisible();
  });

  it("renders the current player's complete animated avatar at 75% of its current size", async () => {
    const { container } = render(
      <AvatarIdentityProvider
        value={{
          currentPlayerID: mason.id,
          avatarConfig: normalizeAvatar({
            effect: "orbit",
            border: "running-gradient",
          }),
        }}
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
    act(() => {
      runtime.projectionSubscriptions[0]?.observer({
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 100,
          height: 150,
          scale: 6.4,
          offsetX: 0,
          offsetY: 0,
        },
        entities: [
          {
            entityId: `avatar:${mason.id}`,
            definitionId: "avatar",
            screen: { x: 120, y: 240 },
            world: { x: 20, y: 40 },
            inViewport: true,
          },
        ],
      });
    });

    const overlay = container.querySelector(
      ".team-lounge__shared-avatar[data-current='true']",
    );
    expect(overlay).toHaveStyle({ "--lounge-avatar-size": "86.4px" });
    expect(
      overlay?.querySelector(".team-lounge__avatar-decoration"),
    ).toBeVisible();
    expect(overlay?.querySelector(".avatar-effect--animated")).toBeVisible();
    expect(overlay?.querySelector(".avatar-border--running")).toBeVisible();
    expect(
      overlay?.querySelector(".avatar-art__layer--background"),
    ).toBeVisible();
    expect(overlay?.querySelector(".avatar-art__layer--head")).toBeVisible();
    expect(overlay?.querySelector(".avatar-art__layer--kit")).toBeVisible();
  });

  it("keeps overlapping live avatars atomic and marks the local stack as topmost", async () => {
    const ava: Player = {
      ...mason,
      id: "player-ava",
      firstName: "Ava",
      lastInitial: "R.",
      initials: "AR",
      avatarConfiguration: normalizeAvatar({
        head: "prism-dragon",
        effect: "orbit",
        border: "running-gradient",
      }),
    };
    const { container } = render(
      <AvatarIdentityProvider
        value={{
          currentPlayerID: mason.id,
          avatarConfig: normalizeAvatar({
            head: "cheetah",
            effect: "pulse",
            border: "plain",
          }),
        }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason, ava]}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    await waitFor(() =>
      expect(runtime.projectionSubscriptions).toHaveLength(1),
    );
    act(() => {
      runtime.projectionSubscriptions[0]?.observer({
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 100,
          height: 150,
          scale: 6.4,
          offsetX: 0,
          offsetY: 0,
        },
        entities: [
          {
            entityId: `avatar:${mason.id}`,
            definitionId: "avatar",
            screen: { x: 120, y: 240 },
            world: { x: 20, y: 40 },
            inViewport: true,
          },
          {
            entityId: `avatar:${ava.id}`,
            definitionId: "avatar",
            screen: { x: 120, y: 240 },
            world: { x: 20, y: 40 },
            inViewport: true,
          },
        ],
      });
      runtime.presenceObserver?.({
        participants: [
          {
            userId: ava.id,
            avatarEntityId: `avatar:${ava.id}`,
            status: "active",
          },
        ],
      });
    });

    const local = container.querySelector(
      ".team-lounge__shared-avatar[data-current='true']",
    );
    const teammate = container.querySelector(
      ".team-lounge__shared-avatar[data-presence='active']",
    );
    expect(local).toHaveAttribute("data-avatar-stack", "local");
    expect(teammate).toHaveAttribute("data-avatar-stack", "teammate");
    expect(local).toHaveStyle({ "--lounge-avatar-size": "86.4px" });
    expect(teammate).toHaveStyle({ "--lounge-avatar-size": "86.4px" });
    expect(local?.querySelectorAll(".avatar-art")).toHaveLength(1);
    expect(teammate?.querySelectorAll(".avatar-art")).toHaveLength(1);
    expect(local?.querySelector(".avatar-art__layer--head")).toBeVisible();
    expect(local?.querySelector(".avatar-effect--pulse")).toBeVisible();
    expect(teammate?.querySelector(".avatar-head--prism-dragon")).toBeVisible();
    expect(teammate?.querySelector(".avatar-effect--animated")).toBeVisible();
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

  it("keeps avatar and item artwork in DOM so their layer bands cannot interleave", async () => {
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
    ).toBe("lounge.stamp.transparent");
    expect(
      runtime.options?.definitions?.find(
        ({ definitionId }) => definitionId === "avatar",
      )?.visual.spriteId,
    ).toBe("lounge.avatar");
    expect(
      runtime.options?.scene?.projectEntityVisual?.({
        kind: "avatar",
        userId: mason.id,
      }),
    ).toBeUndefined();
    expect(
      container.querySelector(".team-lounge__shared-avatar .avatar-art"),
    ).toBeVisible();
  });

  it("keeps overlapping stamps behind props, moving balls, and every avatar stack", async () => {
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
    const overlap = { x: 160, y: 240 };
    act(() => {
      runtime.canonicalObserver?.({
        entities: [
          {
            id: "stamp-one",
            kind: "item",
            definitionId: "zoomigo-stamp-soccer",
            x: 50,
            y: 75,
            rotation: 0,
            scale: 1,
            ownerUserId: mason.id,
            itemRevision: 1,
            behaviorState: {},
          },
          {
            id: "cannon-one",
            kind: "item",
            definitionId: "zoomigo-prop-play-ball-cannon",
            x: 50,
            y: 75,
            rotation: 0,
            scale: 1,
            ownerUserId: mason.id,
            itemRevision: 1,
            behaviorState: {},
          },
          {
            id: "boardwalk-beach-ball",
            kind: "item",
            definitionId: "beach-ball",
            x: 50,
            y: 75,
            rotation: 0,
            scale: 1,
            behaviorState: {},
          },
        ],
      });
      runtime.projectionSubscriptions[0]?.observer({
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 320,
          height: 480,
          scale: 3.2,
          offsetX: 0,
          offsetY: 0,
        },
        entities: [
          {
            entityId: `avatar:${mason.id}`,
            definitionId: "avatar",
            screen: overlap,
            world: { x: 50, y: 75 },
            inViewport: true,
          },
          ...[
            ["stamp-one", "zoomigo-stamp-soccer"],
            ["cannon-one", "zoomigo-prop-play-ball-cannon"],
            ["boardwalk-beach-ball", "beach-ball"],
          ].map(([entityId, definitionId]) => ({
            entityId,
            definitionId,
            screen: overlap,
            world: { x: 50, y: 75 },
            inViewport: true,
            rotation: 0,
          })),
        ],
      });
    });

    const stamp = screen.getByRole("img", {
      name: "Soccer ball stamp, yours; locked from an earlier day",
    });
    const cannon = screen.getByRole("img", {
      name: "Ball cannon item, yours; locked from an earlier day",
    });
    const ball = screen.getByRole("img", { name: "Beach ball item" });
    const avatar = container.querySelector(
      ".team-lounge__shared-avatar[data-current='true']",
    );
    expect(stamp).toHaveStyle({ zIndex: "4" });
    expect(cannon).toHaveStyle({ zIndex: "10" });
    expect(ball).toHaveStyle({ zIndex: "20" });
    expect(cannon.querySelector("img")).toHaveAttribute(
      "src",
      "/team-lounge/items/ball-cannon-v1.svg",
    );
    expect(ball.querySelector("img")).toHaveAttribute(
      "src",
      "/team-lounge/beach-ball.svg",
    );
    expect(avatar).toHaveAttribute("data-avatar-stack", "local");
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

  it("loads device chat packs into the header settings control and dock", async () => {
    prizeInventory.mockResolvedValue([
      {
        item: {
          id: "lounge-chat-pack-space-cadet",
          kind: "lounge_chat_pack",
          slot: "quick_message_pack",
          assetId: "space-cadet",
          label: "Space Cadet chat pack",
          catalogVersion: 1,
          rarity: "rare",
          destination: "team_lounge",
        },
        source: "daily_check_in",
        unlockedAt: "2026-09-02T12:00:00Z",
      },
    ]);
    window.localStorage.setItem(
      "zoomigo:lounge-chat-packs:v1",
      JSON.stringify(["space-cadet"]),
    );
    render(
      <header className="team-lounge__header">
        <div
          className="team-lounge__header-actions"
          data-testid="settings-container"
        />
      </header>,
    );
    const settingsContainer = screen.getByTestId("settings-container");
    render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: mason.id, avatarConfig: defaultAvatar() }}
      >
        <SharedLoungeCanvas
          teamID="team-one"
          player={mason}
          roster={[mason]}
          settingsContainer={settingsContainer}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
        />
      </AvatarIdentityProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Quick-message pack settings" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Quick-message pack settings" })
        .closest(".team-lounge__header-actions"),
    ).toBe(settingsContainer);
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Space Cadet/u }),
      ).toBeChecked(),
    );
    expect(prizeInventory).toHaveBeenCalledWith([
      "lounge_stamp",
      "lounge_prop",
      "lounge_chat_pack",
    ]);
    expect(screen.getByText("1 of 3 selected")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Close chat settings" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByRole("button", { name: "Space Cadet" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Standard" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Space Cadet" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Send Blast off! quick message" }),
    );
    await waitFor(() =>
      expect(runtime.transientActions.at(-1)).toMatchObject({
        action: "zoomigo.quickPhrase",
        payload: { phrase: "space-blast-off" },
      }),
    );
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
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 320,
          height: 480,
          scale: 3.2,
          offsetX: 0,
          offsetY: 0,
        },
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
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 320,
          height: 480,
          scale: 3.2,
          offsetX: 0,
          offsetY: 0,
        },
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
