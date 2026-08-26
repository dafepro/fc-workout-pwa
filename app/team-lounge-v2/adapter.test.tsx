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
      selectedStamp,
    }: {
      onSignalPortChange(sender: ((kind: string) => void) | null): void;
      selectedStamp?: { label?: string; alt?: string } | null;
    }) {
      useEffect(() => {
        onSignalPortChange(relay.send);
        return () => onSignalPortChange(null);
      }, [onSignalPortChange]);
      return (
        <div>Shared lounge {selectedStamp?.label ?? selectedStamp?.alt}</div>
      );
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

  it("lets a player choose one owned stamp before selecting an authored room spot", () => {
    const viewNew = vi.fn();
    render(
      <TeamLoungeV2
        host={host}
        stampUnlocks={{
          availableCount: 1,
          status: "ready",
          choices: [
            { id: "target", kind: "emoji", glyph: "🎯", label: "Target" },
          ],
          newAssetIDs: ["target"],
          unlock: vi.fn(),
          viewNew,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(screen.getByText("Leave one stamp this week")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose Target stamp" }),
    );
    expect(screen.getByText("Shared lounge Target")).toBeVisible();
    expect(
      screen.getByText("Choose a glowing spot in the lounge."),
    ).toBeVisible();
    expect(viewNew).toHaveBeenCalledOnce();
  });
});
