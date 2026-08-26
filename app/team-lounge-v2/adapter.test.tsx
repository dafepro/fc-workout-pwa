import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import type { TeamCanvasWidgetContract } from "../player/team-canvas/widget-contract";
import { TeamLoungeV2 } from "./adapter";

const relay = vi.hoisted(() => ({ send: vi.fn(), editing: [] as boolean[] }));

vi.mock("./SharedLoungeCanvas", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    SharedLoungeCanvas({
      onSignalPortChange,
      selectedStamp,
      stampEditingEnabled = false,
      onPlacementSummaryChange,
      onPlacementError,
      onPlacementPendingChange,
      onPlaceableStampsChange,
      onStampDragStateChange,
    }: {
      onSignalPortChange(sender: ((kind: string) => void) | null): void;
      selectedStamp?: { label?: string; alt?: string } | null;
      stampEditingEnabled?: boolean;
      onPlacementSummaryChange?(summary: {
        earned: number;
        used: number;
        remaining: number;
      }): void;
      onPlacementPendingChange?(pending: boolean): void;
      onPlacementError?(reason: string): void;
      onStampDragStateChange?(
        state: {
          entityID: string;
          overTrash: boolean;
        } | null,
      ): void;
      onPlaceableStampsChange?(
        stamps: Array<{
          assetId: string;
          label: string;
          source: "included" | "earned";
          unlockId?: string;
          isNew: boolean;
        }>,
      ): void;
    }) {
      useEffect(() => {
        onSignalPortChange(relay.send);
        onPlaceableStampsChange?.([
          {
            assetId: "target",
            label: "Target stamp",
            source: "earned",
            unlockId: "canvas-stamp-target",
            isNew: true,
          },
        ]);
        return () => onSignalPortChange(null);
      }, [onPlaceableStampsChange, onSignalPortChange]);
      relay.editing.push(stampEditingEnabled);
      return (
        <div>
          Shared lounge {selectedStamp?.label ?? selectedStamp?.alt}
          {` editing ${stampEditingEnabled ? "on" : "off"}`}
          {selectedStamp ? (
            <button
              type="button"
              onClick={() => onPlacementPendingChange?.(true)}
            >
              Simulate spot
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              onPlacementSummaryChange?.({ earned: 2, used: 1, remaining: 1 })
            }
          >
            Simulate placement budget
          </button>
          <button
            type="button"
            onClick={() => onPlacementError?.("stamp_unavailable")}
          >
            Simulate unavailable
          </button>
          <button
            type="button"
            onClick={() =>
              onStampDragStateChange?.({
                entityID: "stamp-one",
                overTrash: false,
              })
            }
          >
            Simulate stamp drag
          </button>
          <button type="button" onClick={() => onStampDragStateChange?.(null)}>
            Simulate stamp drop
          </button>
        </div>
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
    relay.editing = [];
    vi.useFakeTimers();
  });

  it("opens owner editing for any stamps placed today", () => {
    render(<TeamLoungeV2 host={host} />);
    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(screen.getByText(/Shared lounge\s+editing on/)).toBeVisible();
    expect(relay.editing).toContain(true);
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

  it("replaces the action tray with trash during a stamp drag without opening stamps", () => {
    render(<TeamLoungeV2 host={host} />);

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a stamp to place" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Simulate stamp drag" }),
    );
    expect(
      screen.getByRole("status", { name: "Drop to remove stamp" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Stamps" })).toBeNull();
    expect(
      screen.queryByRole("dialog", { name: "Choose a stamp to place" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate unavailable" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Choose a stamp to place" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Simulate stamp drop" }),
    );
    expect(screen.getByRole("button", { name: "Stamps" })).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: /choose a stamp/i }),
    ).toBeNull();
  });

  it("opens emotes as an anchored popover and stamps over only the canvas", () => {
    render(<TeamLoungeV2 host={host} />);

    fireEvent.click(screen.getByRole("button", { name: "Emotes" }));
    expect(screen.getByLabelText("Choose an emote")).toHaveClass(
      "team-lounge-v2__emote-popover",
    );

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    const dialog = screen.getByRole("dialog", {
      name: "Choose a stamp to place",
    });
    expect(dialog).toHaveClass("team-lounge-v2__menu-sheet");
    expect(dialog.closest(".team-lounge-v2__world")).toBe(
      document.querySelector(".team-lounge-v2__world"),
    );
    expect(dialog.closest(".team-lounge-v2__actions")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close stamps" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the earned weekly budget before free-position placement", () => {
    const viewNew = vi.fn();
    render(
      <TeamLoungeV2
        host={host}
        stampUnlocks={{
          availableCount: 1,
          status: "ready",
          choices: [
            { id: "rocket", kind: "emoji", glyph: "🚀", label: "Rocket" },
          ],
          newAssetIDs: ["target"],
          unlock: vi.fn(),
          viewNew,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate placement budget" }),
    );
    expect(screen.getByText("1 placement ready")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Choose Rocket stamp" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose Target stamp" }),
    );
    expect(
      screen.getByText(/Shared lounge\s+Target\s+editing on/),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simulate spot" }));
    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(screen.getByText("Adding your stamp…")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose Target stamp" }),
    ).toBeDisabled();
    expect(viewNew).toHaveBeenCalledOnce();
  });

  it("clears a stale selection when the server rejects its ownership", () => {
    render(<TeamLoungeV2 host={host} />);
    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate placement budget" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choose Target stamp" }),
    );
    expect(screen.getByText(/Shared lounge\s+Target/)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Simulate unavailable" }),
    );

    expect(screen.getByText(/Shared lounge\s+editing on/)).toBeVisible();
    expect(screen.queryByText(/Shared lounge\s+Target/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That stamp is no longer in your collection. Choose another.",
    );
  });
});
