import { act, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("@canvas-physics/client", () => ({
  CanvasRuntime: class FakeCanvasRuntime {
    constructor() {
      runtime.constructed += 1;
    }

    subscribeLifecycle() {
      return () => undefined;
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
