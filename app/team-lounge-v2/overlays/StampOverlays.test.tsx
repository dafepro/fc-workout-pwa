import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ignoreLoungePointerTarget } from "../runtime-config";
import { StampOverlays, type LoungeStampOverlay } from "./StampOverlays";

const stamp: LoungeStampOverlay = {
  entityID: "stamp-one",
  asset: { id: "target", kind: "emoji", glyph: "🎯", label: "Target" },
  ownerUserID: "player-one",
  rotation: 0,
  scale: 1,
  screen: { x: 80, y: 90 },
  world: { x: 40, y: 50 },
  placementDay: "2026-08-26",
};

describe("StampOverlays", () => {
  it("selects the visible stamp before the Canvas surface can claim its first pointer", () => {
    const canvasPointerDown = vi.fn();

    function PointerSurfaceHarness() {
      const pointerSurface = useRef<HTMLDivElement>(null);
      const [selectedEntityID, setSelectedEntityID] = useState<string | null>(
        null,
      );

      useEffect(() => {
        const surface = pointerSurface.current;
        if (!surface) return;
        surface.addEventListener("pointerdown", canvasPointerDown);
        return () =>
          surface.removeEventListener("pointerdown", canvasPointerDown);
      }, []);

      return (
        <div ref={pointerSurface}>
          <StampOverlays
            stamps={[stamp]}
            selectedStamp={null}
            currentPlayerID="player-one"
            editableEntityIDs={[stamp.entityID]}
            selectedEntityID={selectedEntityID}
            onPlace={vi.fn()}
            onSelect={setSelectedEntityID}
          />
        </div>
      );
    }

    render(<PointerSurfaceHarness />);
    const visibleStamp = screen.getByRole("button", {
      name: "Target stamp, yours; tap then drag to move",
    });

    fireEvent.pointerDown(visibleStamp, {
      buttons: 1,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(visibleStamp).toHaveAttribute("aria-pressed", "true");
    expect(canvasPointerDown).not.toHaveBeenCalled();

    fireEvent.pointerDown(visibleStamp, {
      buttons: 1,
      pointerId: 2,
      pointerType: "touch",
    });
    expect(canvasPointerDown).toHaveBeenCalledTimes(1);
  });

  it("keeps edit controls selected when the Canvas pointer surface sees empty-space taps", () => {
    const onScale = vi.fn();

    function PointerSurfaceHarness() {
      const pointerSurface = useRef<HTMLDivElement>(null);
      const [selectedEntityID, setSelectedEntityID] = useState<string | null>(
        stamp.entityID,
      );

      useEffect(() => {
        const surface = pointerSurface.current;
        if (!surface) return;
        const clearSelection = (event: PointerEvent) => {
          if (ignoreLoungePointerTarget(event.target)) return;
          const target = event.target;
          if (
            target instanceof Element &&
            !target.closest(".team-lounge-v2__placed-stamp")
          ) {
            setSelectedEntityID(null);
          }
        };
        surface.addEventListener("pointerdown", clearSelection);
        return () => surface.removeEventListener("pointerdown", clearSelection);
      }, []);

      return (
        <div ref={pointerSurface}>
          <StampOverlays
            stamps={[stamp]}
            selectedStamp={null}
            currentPlayerID="player-one"
            editableEntityIDs={[stamp.entityID]}
            selectedEntityID={selectedEntityID}
            onPlace={vi.fn()}
            onScale={onScale}
          />
        </div>
      );
    }

    render(<PointerSurfaceHarness />);
    const grow = screen.getByRole("button", { name: "Make stamp larger" });
    fireEvent.pointerDown(grow, { pointerId: 1, pointerType: "touch" });

    expect(
      screen.getByRole("group", { name: "Edit selected stamp" }),
    ).toBeVisible();
    expect(onScale).toHaveBeenCalledWith(stamp.entityID, 1.1, true);
  });
});
