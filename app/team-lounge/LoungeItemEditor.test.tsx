import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoungeItemEditor, type LoungeEditableItem } from "./LoungeItemEditor";

const item: LoungeEditableItem = {
  entityID: "canvas-item-one",
  label: "Bolt",
  glyph: "⚡",
  category: "stamp",
  editable: true,
  owner: "current",
  itemRevision: 3,
  screen: { x: 120, y: 180 },
  transform: { x: 40, y: 55, rotation: 0, scale: 1 },
};

describe("LoungeItemEditor", () => {
  it("selects an owned current-day item and exposes bounded edit actions", () => {
    const onSelect = vi.fn();
    const onRotate = vi.fn();
    const onScale = vi.fn();
    const onFinish = vi.fn();
    render(
      <LoungeItemEditor
        items={[item]}
        selectedEntityID={item.entityID}
        pending={false}
        dragging={null}
        onSelect={onSelect}
        onMove={vi.fn()}
        onRotate={onRotate}
        onScale={onScale}
        onDelete={vi.fn()}
        onFinish={onFinish}
        onDragStateChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Edit selected stamp" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Make stamp larger" }));
    expect(onScale).toHaveBeenCalledWith(item, 1.1);
    fireEvent.click(
      screen.getByRole("button", { name: "Rotate stamp right 15 degrees" }),
    );
    expect(onRotate.mock.calls[0]?.[0]).toBe(item);
    expect(onRotate.mock.calls[0]?.[1]).toBeCloseTo(Math.PI / 12);
    fireEvent.click(screen.getByRole("button", { name: "Finish editing" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("keeps teammate and earlier-day items non-interactive", () => {
    render(
      <LoungeItemEditor
        items={[
          { ...item, entityID: "old-mine", editable: false },
          {
            ...item,
            entityID: "theirs",
            editable: false,
            owner: "teammate",
          },
        ]}
        selectedEntityID={null}
        pending={false}
        dragging={null}
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onRotate={vi.fn()}
        onScale={vi.fn()}
        onDelete={vi.fn()}
        onFinish={vi.fn()}
        onDragStateChange={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByLabelText("Bolt stamp, yours; locked from an earlier day"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Bolt stamp placed by a teammate"),
    ).toBeVisible();
  });

  it("direct-drags an editable item and reports a trash drop separately", () => {
    const onMove = vi.fn();
    const onDelete = vi.fn();
    const onDragStateChange = vi.fn();
    const trash = document.createElement("div");
    vi.spyOn(trash, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 500,
      left: 0,
      top: 500,
      right: 320,
      bottom: 560,
      width: 320,
      height: 60,
      toJSON: () => undefined,
    });
    const trashTargetRef = { current: trash };
    const { rerender } = render(
      <LoungeItemEditor
        items={[item]}
        selectedEntityID={null}
        pending={false}
        dragging={null}
        trashTargetRef={trashTargetRef}
        onSelect={vi.fn()}
        onMove={onMove}
        onRotate={vi.fn()}
        onScale={vi.fn()}
        onDelete={onDelete}
        onFinish={vi.fn()}
        onDragStateChange={onDragStateChange}
      />,
    );
    const editable = screen.getByRole("button", {
      name: "Bolt stamp, yours; tap or drag to move",
    });

    fireEvent.pointerDown(editable, {
      pointerId: 1,
      clientX: 120,
      clientY: 180,
    });
    fireEvent.pointerMove(document, {
      pointerId: 1,
      clientX: 150,
      clientY: 210,
    });
    fireEvent.pointerUp(document, {
      pointerId: 1,
      clientX: 150,
      clientY: 210,
    });
    expect(onMove).toHaveBeenCalledWith(item, { x: 150, y: 210 });

    rerender(
      <LoungeItemEditor
        items={[item]}
        selectedEntityID={item.entityID}
        pending={false}
        dragging={null}
        trashTargetRef={trashTargetRef}
        onSelect={vi.fn()}
        onMove={onMove}
        onRotate={vi.fn()}
        onScale={vi.fn()}
        onDelete={onDelete}
        onFinish={vi.fn()}
        onDragStateChange={onDragStateChange}
      />,
    );
    const selected = screen.getByRole("button", {
      name: "Bolt stamp, yours; tap or drag to move",
    });
    fireEvent.pointerDown(selected, {
      pointerId: 2,
      clientX: 120,
      clientY: 180,
    });
    fireEvent.pointerMove(document, {
      pointerId: 2,
      clientX: 120,
      clientY: 520,
    });
    fireEvent.pointerUp(document, {
      pointerId: 2,
      clientX: 120,
      clientY: 520,
    });
    expect(onDelete).toHaveBeenCalledWith(item);
    expect(onDragStateChange).toHaveBeenCalledWith({
      entityID: item.entityID,
      overTrash: true,
    });
  });
});
