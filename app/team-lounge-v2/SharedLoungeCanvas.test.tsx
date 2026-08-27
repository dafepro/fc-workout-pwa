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
    | ((error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      }) => void)
    | undefined,
  lifecycleObserver: undefined as
    | ((event: { state: string }) => void)
    | undefined,
  options: undefined as
    | {
        mount: HTMLElement;
        pointerElement?: HTMLElement;
        scene?: { touchAction?: string };
        onEditSelectionChange?: (state: {
          selectedEntityId?: string;
          ghost?: { entityId: string };
        }) => void;
      }
    | undefined,
  editModes: [] as boolean[],
  editMode: false,
  selectedForEdit: [] as string[],
  clearedSelections: 0,
  scaled: [] as Array<{ entityID: string; scale: number }>,
  rotated: [] as Array<{ entityID: string; rotation: number }>,
  deleted: [] as string[],
  transformed: [] as Array<{
    entityID: string;
    transform: {
      x: number;
      y: number;
      rotation: number;
      scale?: number;
      z?: number;
    };
    preview: boolean;
  }>,
}));

const gateway = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class FakeCanvasRuntime {
    constructor(options: {
      mount: HTMLElement;
      pointerElement?: HTMLElement;
      scene?: { touchAction?: string };
      onError?: (error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      }) => void;
      onEditSelectionChange?: (state: {
        selectedEntityId?: string;
        ghost?: { entityId: string };
      }) => void;
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
        canvasSize: { width: 100, height: 150 },
        viewport: {
          width: 1_000,
          height: 1_500,
          scale: 10,
          offsetX: 0,
          offsetY: 0,
        },
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
      runtime.editMode = enabled;
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

    rotateItem(entityID: string, rotation: number) {
      runtime.rotated.push({ entityID, rotation });
    }

    deleteItem(entityID: string) {
      runtime.deleted.push(entityID);
    }

    transformItem(
      entityID: string,
      transform: {
        x: number;
        y: number;
        rotation: number;
        scale?: number;
        z?: number;
      },
      preview = false,
    ) {
      runtime.transformed.push({ entityID, transform, preview });
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
    roomID: "team:team-one:lounge:2026-08-24:v5",
    serverURL: "wss://example.test/canvas",
    credentialProvider: vi.fn(),
    visitorIDs: ["player-two"],
    placementCredits: 2,
    placementDay: "2026-08-26",
    placeableStamps: [
      {
        assetId: "target",
        label: "Target stamp",
        source: "earned",
        unlockId: "canvas-stamp-target",
        isNew: true,
      },
    ],
    placeableProps: [
      {
        assetId: "beach-ball",
        label: "Beach ball",
        unlockId: "canvas-prop-beach-ball",
        isNew: true,
      },
    ],
    theme: {
      id: "beach-boardwalk",
      version: 1,
      name: "Beach Boardwalk",
    },
  }),
  requestTeamLoungeAccess: gateway.refresh,
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
    runtime.editMode = false;
    runtime.selectedForEdit = [];
    runtime.clearedSelections = 0;
    runtime.scaled = [];
    runtime.rotated = [];
    runtime.deleted = [];
    runtime.transformed = [];
    gateway.refresh.mockReset();
    gateway.refresh.mockResolvedValue({
      roomID: "team:team-one:lounge:2026-08-24:v5",
      placementCredits: 2,
      placementDay: "2026-08-26",
      placeableStamps: [
        {
          assetId: "bolt",
          label: "Bolt",
          source: "included",
          isNew: false,
        },
      ],
      placeableProps: [],
    });
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

  it("lets the owner select today's stamp without opening the placement tray", async () => {
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );

    const stamp = screen.getByRole("button", {
      name: "Target stamp, yours; tap then drag to move",
    });
    fireEvent.pointerDown(stamp, {
      buttons: 1,
      pointerId: 1,
      pointerType: "touch",
    });

    expect(runtime.editModes).toContain(true);
    expect(runtime.selectedForEdit).toEqual(["mine"]);
    expect(stamp).toHaveAttribute("aria-pressed", "true");
  });

  it("projects an earned beach ball as a physical prop without stamp transforms", async () => {
    const onPlaceablePropsChange = vi.fn();
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
        onPlaceablePropsChange={onPlaceablePropsChange}
      />,
    );

    await waitFor(() =>
      expect(onPlaceablePropsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          assetId: "beach-ball",
          unlockId: "canvas-prop-beach-ball",
        }),
      ]),
    );
    act(() =>
      runtime.overlayObserver?.({
        entities: [
          {
            entityId: "my-beach-ball",
            kind: "item",
            definitionId: "zoomigo-prop-beach-ball",
            ownerUserId: "player-one",
            screen: { x: 180, y: 240 },
            world: { x: 52, y: 72, z: 0 },
            rotation: 0,
            scale: 1,
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );

    const prop = screen.getByRole("button", {
      name: "Beach ball prop, yours; tap then drag to move",
    });
    fireEvent.pointerDown(prop, {
      buttons: 1,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(
      screen.getByRole("group", { name: "Edit selected prop" }),
    ).toBeVisible();
    expect(screen.queryByRole("group", { name: "Stamp size" })).toBeNull();
  });

  it("gives the visible avatar first claim over an overlapping editable stamp", async () => {
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
            entityId: "avatar:player-one",
            kind: "avatar",
            userId: "player-one",
            screen: { x: 140, y: 210 },
            world: { x: 45, y: 60, z: 0 },
            rotation: 0,
            scale: 1,
            visible: true,
            inViewport: true,
          },
          {
            entityId: "mine",
            kind: "item",
            definitionId: "zoomigo-stamp-target",
            ownerUserId: "player-one",
            screen: { x: 140, y: 210 },
            world: { x: 45, y: 60, z: 0 },
            rotation: 0,
            scale: 1.4,
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );

    let editModeSeenAtNativeCapture: boolean | undefined;
    const observeNativePointer = () => {
      editModeSeenAtNativeCapture = runtime.editMode;
    };
    document.addEventListener("pointerdown", observeNativePointer, true);
    try {
      const avatar = screen
        .getByLabelText("Mason C., you")
        .querySelector(".team-lounge-v2__participant-avatar");
      expect(avatar).not.toBeNull();
      fireEvent.pointerDown(avatar as Element, {
        buttons: 1,
        pointerId: 1,
        pointerType: "touch",
      });
    } finally {
      document.removeEventListener("pointerdown", observeNativePointer, true);
    }

    expect(editModeSeenAtNativeCapture).toBe(false);
    await waitFor(() =>
      expect(runtime.editModes.slice(-2)).toEqual([false, true]),
    );
    expect(runtime.selectedForEdit).toEqual([]);
  });

  it("places an owned stamp at a tapped free position and recognizes the canonical item", async () => {
    const onPlacementSummaryChange = vi.fn();
    const onPlacementError = vi.fn();
    const onPlacementPendingChange = vi.fn();
    const onPlaceableStampsChange = vi.fn();
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
        onPlacementSummaryChange={onPlacementSummaryChange}
        onPlacementError={onPlacementError}
        onPlacementPendingChange={onPlacementPendingChange}
        onPlaceableStampsChange={onPlaceableStampsChange}
        onStateChange={vi.fn()}
        onPresenceChange={vi.fn()}
        onSignalPortChange={vi.fn()}
      />,
    );

    const placementSurface = await screen.findByRole("button", {
      name: "Place Target in the lounge",
    });
    expect(onPlaceableStampsChange).toHaveBeenCalledWith([
      expect.objectContaining({ assetId: "target", source: "earned" }),
    ]);
    fireEvent.click(placementSurface, { clientX: 450, clientY: 600 });
    fireEvent.click(placementSurface, { clientX: 450, clientY: 600 });
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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );
    expect(onPlacementSummaryChange).toHaveBeenLastCalledWith({
      earned: 2,
      used: 1,
      remaining: 1,
    });
    expect(screen.getByLabelText(/Target stamp, yours/)).toBeVisible();

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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
          {
            entityId: "i2",
            kind: "item",
            definitionId: "zoomigo-stamp-star",
            ownerUserId: "player-one",
            screen: { x: -20, y: -20 },
            scale: 1,
            rotation: 0,
            resolvedConfig: { placementDay: "2026-08-25" },
            visible: false,
            inViewport: false,
          },
        ],
      }),
    );
    expect(onPlacementSummaryChange).toHaveBeenLastCalledWith({
      earned: 2,
      used: 2,
      remaining: 0,
    });
    expect(screen.queryByLabelText(/Star stamp/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Place Target in the lounge" }),
    ).toBeNull();

    act(() =>
      runtime.onError?.({
        code: "durable_command_rejected",
        message: "stamp_unavailable",
      }),
    );
    expect(onPlacementError).toHaveBeenCalledWith("stamp_unavailable");
    expect(onPlacementPendingChange).toHaveBeenLastCalledWith(false);
    await waitFor(() =>
      expect(gateway.refresh).toHaveBeenCalledWith("team-one"),
    );
    expect(onPlaceableStampsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ assetId: "bolt", source: "included" }),
    ]);
  });

  it("lets only the owner select, scale, and snap-rotate their placed stamp", async () => {
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
            resolvedConfig: { placementDay: "2026-08-26" },
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
            resolvedConfig: { placementDay: "2026-08-25" },
            visible: true,
            inViewport: true,
          },
          {
            entityId: "old-mine",
            kind: "item",
            definitionId: "zoomigo-stamp-star",
            ownerUserId: "player-one",
            screen: { x: 60, y: 120 },
            world: { x: 15, y: 35, z: 0 },
            rotation: 0,
            scale: 1,
            resolvedConfig: { placementDay: "2026-08-25" },
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
    expect(screen.getByLabelText(/Star stamp, yours; locked/)).not.toHaveClass(
      "team-lounge-v2__placed-stamp--editable",
    );

    act(() =>
      runtime.options?.onEditSelectionChange?.({ selectedEntityId: "mine" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make stamp larger" }));
    expect(runtime.scaled).toEqual([{ entityID: "mine", scale: 1.1 }]);
    const rotateRight = screen.getByRole("button", {
      name: "Rotate stamp right 15 degrees",
    });
    fireEvent.pointerDown(rotateRight, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(rotateRight, { pointerId: 1, pointerType: "touch" });
    expect(runtime.transformed.at(-1)).toMatchObject({
      entityID: "mine",
      transform: {
        x: 45,
        y: 60,
        z: 0,
        scale: 1.1,
      },
      preview: true,
    });
    expect(runtime.transformed.at(-1)?.transform.rotation).toBeCloseTo(
      Math.PI / 12,
    );
    expect(runtime.rotated).toHaveLength(1);
    expect(runtime.rotated[0]?.entityID).toBe("mine");
    expect(runtime.rotated[0]?.rotation).toBeCloseTo(Math.PI / 12);
    expect(screen.queryByRole("button", { name: /mirror/i })).toBeNull();

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

  it("deletes a dragged editable stamp released over the consumer trash target", async () => {
    const onStampDragStateChange = vi.fn();
    const onPlacementError = vi.fn();
    const onStampDeleteError = vi.fn();
    const trashTarget = document.createElement("div");
    vi.spyOn(trashTarget, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 600,
      top: 600,
      right: 320,
      bottom: 680,
      left: 20,
      width: 300,
      height: 80,
      toJSON: () => undefined,
    });
    render(
      <SharedLoungeCanvas
        teamID="team-one"
        playerID="player-one"
        roster={[]}
        stampEditingEnabled
        stampTrashTargetRef={{ current: trashTarget }}
        onStampDragStateChange={onStampDragStateChange}
        onPlacementError={onPlacementError}
        onStampDeleteError={onStampDeleteError}
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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );
    act(() =>
      runtime.options?.onEditSelectionChange?.({
        selectedEntityId: "mine",
        ghost: { entityId: "mine" },
      }),
    );
    expect(
      screen.queryByRole("group", { name: "Edit selected stamp" }),
    ).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    act(() =>
      runtime.options?.onEditSelectionChange?.({ selectedEntityId: "mine" }),
    );
    expect(onStampDragStateChange).toHaveBeenLastCalledWith({
      entityID: "mine",
      overTrash: false,
    });
    expect(
      screen.queryByRole("group", { name: "Edit selected stamp" }),
    ).toBeNull();
    fireEvent.pointerMove(document, { clientX: 120, clientY: 640 });
    expect(onStampDragStateChange).toHaveBeenLastCalledWith({
      entityID: "mine",
      overTrash: true,
    });

    fireEvent.pointerUp(document, { clientX: 120, clientY: 640 });
    expect(runtime.clearedSelections).toBeGreaterThan(0);
    expect(runtime.deleted).toEqual(["mine"]);
    expect(onStampDragStateChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.queryByRole("button", {
        name: "Target stamp, yours; tap then drag to move",
      }),
    ).toBeNull();
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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Target stamp, yours; tap then drag to move",
      }),
    ).toBeNull();
    act(() =>
      runtime.onError?.({
        code: "durable_command_rejected",
        message: "stamp_unavailable",
        details: {
          commandKind: 3,
          entityId: "mine",
          preview: false,
        },
      }),
    );
    act(() => runtime.overlayObserver?.({ entities: [] }));
    act(() =>
      runtime.onError?.({
        code: "durable_command_rejected",
        message: "outside_canvas",
      }),
    );
    expect(onPlacementError).not.toHaveBeenCalled();
    expect(onStampDeleteError).not.toHaveBeenCalled();

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
            resolvedConfig: { placementDay: "2026-08-26" },
            visible: true,
            inViewport: true,
          },
        ],
      }),
    );
    act(() =>
      runtime.options?.onEditSelectionChange?.({
        selectedEntityId: "mine",
        ghost: { entityId: "mine" },
      }),
    );
    fireEvent.pointerMove(document, { clientX: 120, clientY: 640 });
    fireEvent.pointerUp(document, { clientX: 120, clientY: 640 });
    act(() =>
      runtime.onError?.({
        code: "durable_command_rejected",
        message: "stamp_locked",
        details: {
          commandKind: 2,
          entityId: "mine",
          preview: false,
        },
      }),
    );
    await waitFor(
      () => expect(onStampDeleteError).toHaveBeenCalledWith("stamp_locked"),
      { timeout: 2_500 },
    );
    expect(
      screen.getByRole("button", {
        name: "Target stamp, yours; tap then drag to move",
      }),
    ).toBeVisible();
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

    const placementSurface = await screen.findByRole("button", {
      name: "Place Star in the lounge",
    });
    fireEvent.click(placementSurface, { clientX: 450, clientY: 600 });
    expect(placementSurface).toBeDisabled();

    act(() => runtime.lifecycleObserver?.({ state: "reconnecting" }));
    expect(onPlacementPendingChange).toHaveBeenLastCalledWith(false);
    expect(placementSurface).toBeEnabled();
    fireEvent.click(placementSurface, { clientX: 450, clientY: 600 });
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
