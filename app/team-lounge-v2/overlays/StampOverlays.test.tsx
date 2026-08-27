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
  it("previews the selected stamp at the intended landing point", () => {
    const onPlace = vi.fn();
    const { container } = render(
      <StampOverlays
        stamps={[]}
        selectedStamp={stamp.asset}
        currentPlayerID="player-one"
        onPlace={onPlace}
      />,
    );
    const surface = screen.getByRole("button", {
      name: "Place Target in the lounge",
    });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 30,
      top: 30,
      right: 320,
      bottom: 480,
      left: 20,
      width: 300,
      height: 450,
      toJSON: () => undefined,
    });
    const ghost = container.querySelector(".team-lounge-v2__placement-ghost");
    expect(ghost).toBeVisible();
    expect(ghost).toHaveStyle({ left: "50%", top: "55%" });

    fireEvent.pointerMove(surface, { clientX: 170, clientY: 255 });
    expect(ghost).toHaveStyle({ left: "150px", top: "225px" });
    fireEvent.click(surface, { clientX: 170, clientY: 255 });
    expect(onPlace).toHaveBeenCalledWith({ x: 150, y: 225 });
  });

  it("marks only today's owned stamps as editable", () => {
    render(
      <StampOverlays
        stamps={[
          stamp,
          {
            ...stamp,
            entityID: "old-mine",
            placementDay: "2026-08-25",
            screen: { x: 120, y: 130 },
          },
          {
            ...stamp,
            entityID: "theirs",
            ownerUserID: "player-two",
            screen: { x: 160, y: 170 },
          },
        ]}
        selectedStamp={null}
        currentPlayerID="player-one"
        editableEntityIDs={[stamp.entityID]}
        onPlace={vi.fn()}
      />,
    );

    const editable = screen.getByRole("button", {
      name: "Target stamp, yours; tap then drag to move",
    });
    expect(editable).not.toHaveTextContent("Edit");
    expect(screen.queryByText("Edit")).toBeNull();
  });

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
    expect(canvasPointerDown.mock.calls[0]?.[0]).toMatchObject({
      defaultPrevented: true,
    });
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

  it("leaves only the moving stamp visible while its edit chrome is suppressed", () => {
    render(
      <StampOverlays
        stamps={[stamp]}
        selectedStamp={null}
        currentPlayerID="player-one"
        editableEntityIDs={[stamp.entityID]}
        selectedEntityID={stamp.entityID}
        draggingEntityID={stamp.entityID}
        onPlace={vi.fn()}
      />,
    );

    const movingStamp = screen.getByLabelText(/Target stamp, yours/);
    expect(movingStamp).toBeVisible();
    expect(
      screen.queryByRole("group", { name: "Edit selected stamp" }),
    ).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(movingStamp).not.toHaveClass(
      "team-lounge-v2__placed-stamp--editable",
      "team-lounge-v2__placed-stamp--selected",
    );
  });
});
