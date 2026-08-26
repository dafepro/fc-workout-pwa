import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import type { TeamCanvasWidgetContract } from "../player/team-canvas/widget-contract";
import { TeamLoungeV2 } from "./adapter";

const relay = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("./SharedLoungeCanvas", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    SharedLoungeCanvas({
      onSignalPortChange,
    }: {
      onSignalPortChange(sender: ((kind: string) => void) | null): void;
    }) {
      useEffect(() => {
        onSignalPortChange(relay.send);
        return () => onSignalPortChange(null);
      }, [onSignalPortChange]);
      return <div>Shared lounge</div>;
    },
  };
});

const host = {
  version: 1,
  identity: {
    teamID: "team-one",
    playerID: "player-one",
    avatar: defaultAvatar(),
  },
  access: { state: "ready", error: null },
  room: {
    localState: {},
    projection: { members: [] },
    localSettings: {},
    selectedPieceID: null,
  },
  inventory: { availableCount: 0, choices: [], unlock: vi.fn() },
  actions: {},
  lifecycle: { connection: "connected", reducedMotion: false },
  telemetry: {},
} as unknown as TeamCanvasWidgetContract;

describe("TeamLoungeV2 emote controls", () => {
  beforeEach(() => {
    relay.send.mockReset();
    vi.useFakeTimers();
  });

  it("sends an allowlisted signal once and holds the controls through cooldown", () => {
    render(<TeamLoungeV2 host={host} />);
    fireEvent.click(screen.getByRole("button", { name: "Emotes" }));
    const wave = screen.getByRole("button", { name: "Send Wave emote" });
    expect(wave).toBeEnabled();
    fireEvent.click(wave);
    expect(relay.send).toHaveBeenCalledWith("zoomigo.emote.wave");

    fireEvent.click(screen.getByRole("button", { name: "Emotes" }));
    expect(
      screen.getByRole("button", { name: "Send Wave emote" }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(2_000));
    expect(
      screen.getByRole("button", { name: "Send Wave emote" }),
    ).toBeEnabled();
  });
});
