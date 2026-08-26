import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

const runtime = vi.hoisted(() => ({
  constructed: 0,
  started: 0,
  stopped: 0,
  presented: false,
  sentSignals: [] as string[],
  signalObserver: undefined as
    | ((signal: { participantId: string; kind: string }) => void)
    | undefined,
  overlayObserver: undefined as
    | ((snapshot: { entities: unknown[] }) => void)
    | undefined,
  spawned: [] as Array<{ definitionId: string; at: { x: number; y: number } }>,
  onError: undefined as
    | ((error: { code: string; message: string }) => void)
    | undefined,
  lifecycleObserver: undefined as
    | ((event: { state: string }) => void)
    | undefined,
  options: undefined as
    | {
        mount: HTMLElement;
        pointerElement?: HTMLElement;
        scene?: { touchAction?: string };
        onEditSelectionChange?: (state: { selectedEntityId?: string }) => void;
      }
    | undefined,
  editModes: [] as boolean[],
  selectedForEdit: [] as string[],
  clearedSelections: 0,
  scaled: [] as Array<{ entityID: string; scale: number }>,
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class FakeCanvasRuntime {
    constructor(options: {
      mount: HTMLElement;
      pointerElement?: HTMLElement;
      scene?: { touchAction?: string };
      onError?: (error: { code: string; message: string }) => void;
      onEditSelectionChange?: (state: { selectedEntityId?: string }) => void;
    }) {
      runtime.constructed += 1;
      runtime.onError = options.onError;
      runtime.options = options;
    }

    subscribeLifecycle(observer: (event: { state: string }) => void) {
      runtime.lifecycleObserver = observer;
      return () => {
        runtime.lifecycleObserver = undefined;
      };
    }

    subscribePresence(observer: (snapshot: unknown) => void) {
      observer({
        participants: [
          {
            participantId: "player-one",
            avatarEntityId: "avatar:player-one",
            status: "active",
          },
        ],
      });
      return () => undefined;
    }

    subscribeOverlayProjection(observer: (snapshot: unknown) => void) {
      runtime.overlayObserver = observer as typeof runtime.overlayObserver;
      observer({
        entities: [
          {
            entityId: "avatar:player-one",
            screen: { x: 120, y: 180 },
            visible: true,
            inViewport: true,
          },
        ],
      });
      return () => undefined;
    }

    subscribeParticipantSignals(
      observer: (signal: { participantId: string; kind: string }) => void,
    ) {
      runtime.signalObserver = observer;
      return () => {
        runtime.signalObserver = undefined;
      };
    }

    sendParticipantSignal(kind: string) {
      runtime.sentSignals.push(kind);
    }

    spawnItem(definitionId: string, at: { x: number; y: number }) {
      runtime.spawned.push({ definitionId, at });
    }

    setEditMode(enabled: boolean) {
      runtime.editModes.push(enabled);
    }

    selectItemForEdit(entityID: string) {
      runtime.selectedForEdit.push(entityID);
      runtime.options?.onEditSelectionChange?.({ selectedEntityId: entityID });
      return true;
    }

    clearItemEditSelection() {
      runtime.clearedSelections += 1;
      runtime.options?.onEditSelectionChange?.({});
    }

    scaleItem(entityID: string, scale: number) {
      runtime.scaled.push({ entityID, scale });
    }

    projectWorldPoint(point: { x: number; y: number }) {
      if (!runtime.presented) throw new Error("viewport is not ready");
      return { screen: point, inCanvas: true, inViewport: true };
    }

    async start() {
      runtime.started += 1;
    }

    async whenPresented() {
      runtime.presented = true;
    }

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
    visitorIDs: ["player-two"],
  }),
}));

describe("SharedLoungeCanvas", () => {
  beforeEach(() => {
    runtime.constructed = 0;
    runtime.started = 0;
    runtime.stopped = 0;
    runtime.presented = false;
    runtime.sentSignals = [];
    runtime.signalObserver = undefined;
    runtime.overlayObserver = undefined;
    runtime.spawned = [];
    runtime.onError = undefined;
    runtime.lifecycleObserver = undefined;
    runtime.options = undefined;
    runtime.editModes = [];
    runtime.selectedForEdit = [];
    runtime.clearedSelections = 0;
    runtime.scaled = [];
  });

  it("keeps empty room gestures scrollable and reserves the current avatar gesture", async () => {
    render(
      <div className="team-lounge-v2__world">
        <SharedLoungeCanvas
          teamID="team-one"
          playerID="player-one"
          roster={[
            {
              playerID: "player-one",
              displayName: "Mason C.",
              avatarConfiguration: defaultAvatar(),
            },
          ]}
          onStateChange={vi.fn()}
          onPresenceChange={vi.fn()}
          onSignalPortChange={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => expect(runtime.started).toBe(1));
    expect(runtime.options?.pointerElement).toHaveClass(
      "team-lounge-v2__world",
    );
    expect(runtime.options?.scene?.touchAction).toBe("pan-y");
    expect(screen.getByLabelText("Mason C., you")).toHaveClass(
      "team-lounge-v2__participant--current",
    );
  });

  it("places an owned stamp through an authored spot and recognizes the canonical item", async () => {
    const onPlacementChange = vi.fn();
    const onPlacementError = vi.fn();
    const onPlacementPendingChange = vi.fn();
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[
          {
            playerID: "player-one",
            displayName: "Mason C.",
            avatarConfiguration: defaultAvatar(),
          },
        ]}
        selectedStamp={{
          id: "target",
          kind: "emoji",
          glyph: "🎯",
          label: "Target",
        }}
        onPlacementChange={onPlacementChange}
        onPlacementError={onPlacementError}
        onPlacementPendingChange={onPlacementPendingChange}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
      />,
    );

    const spot = await screen.findByRole("button", {
      name: "Place Target at Sand center",
    });
    fireEvent.click(spot);
    fireEvent.click(spot);
    expect(runtime.spawned).toEqual([
      {
        definitionId: "zoomigo-stamp-target",
        at: { x: 45, y: 60 },
      },
    ]);
    expect(onPlacementPendingChange).toHaveBeenLastCalledWith(true);

    act(() =>
      runtime.overlayObserver?.({
        entities: [
          {
            entityId: "i1",
            kind: "item",
            definitionId: "zoomigo-stamp-target",
            ownerUserId: "player-one",
            screen: { x: 140, y: 210 },
            scale: 1,
            rotation: 0,
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );
    expect(onPlacementChange).toHaveBeenLastCalledWith("target");
    expect(
      screen.getByLabelText("Target stamp placed by a teammate"),
    ).toBeVisible();

    act(() =>
      runtime.onError?.({
        code: "durable_command_rejected",
        message: "stamp_unavailable",
      }),
    );
    expect(onPlacementError).toHaveBeenCalledWith("stamp_unavailable");
    expect(onPlacementPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("lets only the owner select and scale their placed stamp", async () => {
    const view = render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
        stampEditingEnabled
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(runtime.started).toBe(1));
    act(() =>
      runtime.overlayObserver?.({
        entities: [
          {
            entityId: "mine",
            kind: "item",
            definitionId: "zoomigo-stamp-target",
            ownerUserId: "player-one",
            screen: { x: 140, y: 210 },
            world: { x: 45, y: 60, z: 0 },
            rotation: 0,
            scale: 1,
            visible: true,
            inViewport: true,
          },
          {
            entityId: "theirs",
            kind: "item",
            definitionId: "zoomigo-stamp-star",
            ownerUserId: "player-two",
            screen: { x: 80, y: 90 },
            world: { x: 20, y: 30, z: 0 },
            rotation: 0,
            scale: 1,
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );

    expect(runtime.editModes).toContain(true);
    expect(
      screen.getByLabelText("Target stamp, yours; tap then drag to move"),
    ).toHaveClass("team-lounge-v2__placed-stamp--editable");
    expect(
      screen.getByLabelText("Star stamp placed by a teammate"),
    ).not.toHaveClass("team-lounge-v2__placed-stamp--editable");

    act(() =>
      runtime.options?.onEditSelectionChange?.({ selectedEntityId: "mine" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make stamp larger" }));
    expect(runtime.scaled).toEqual([{ entityID: "mine", scale: 1.1 }]);

    view.rerender(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
        stampEditingEnabled={false}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(runtime.editModes.at(-1)).toBe(false));
  });

  it("clears a stranded placement when reconnecting so the player can retry", async () => {
    const onPlacementPendingChange = vi.fn();
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
        selectedStamp={{
          id: "star",
          kind: "emoji",
          glyph: "⭐",
          label: "Star",
        }}
        onPlacementPendingChange={onPlacementPendingChange}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
      />,
    );

    const spot = await screen.findByRole("button", {
      name: "Place Star at Sand center",
    });
    fireEvent.click(spot);
    expect(spot).toBeDisabled();

    act(() => runtime.lifecycleObserver?.({ state: "reconnecting" }));
    expect(onPlacementPendingChange).toHaveBeenLastCalledWith(false);
    expect(spot).toBeEnabled();
    fireEvent.click(spot);
    expect(runtime.spawned).toHaveLength(2);
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
      onSignalPortChange: vi.fn(),
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

  it("relays predefined signals and renders their acknowledged sender", async () => {
    const onSignalPortChange = vi.fn();
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[
          {
            playerID: "player-one",
            displayName: "Mason C.",
            avatarConfiguration: defaultAvatar(),
          },
          {
            playerID: "player-two",
            displayName: "Maya R.",
            avatarConfiguration: defaultAvatar(),
          },
        ]}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={onSignalPortChange}
      />,
    );

    await waitFor(() => expect(runtime.started).toBe(1));
    const send = onSignalPortChange.mock.calls.find(
      ([candidate]) => typeof candidate === "function",
    )?.[0] as ((kind: string) => void) | undefined;
    expect(send).toBeTypeOf("function");
    act(() => send?.("zoomigo.emote.wave"));
    expect(runtime.sentSignals).toEqual(["zoomigo.emote.wave"]);

    act(() =>
      runtime.signalObserver?.({
        participantId: "player-one",
        kind: "zoomigo.emote.wave",
      }),
    );
    expect(screen.getByText("👋")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You sent a Wave");
    expect(
      screen.getByLabelText("Maya R. stopped by this week"),
    ).toBeInTheDocument();
  });
});
