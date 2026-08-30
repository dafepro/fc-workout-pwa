import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoungeItemEditor, type LoungeEditableItem } from "./LoungeItemEditor";

const item: LoungeEditableItem = {
  entityID: "canvas-item-one",
  label: "Bolt",
  glyph: "⚡",
  kind: "lounge_stamp",
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

    const editor = screen.getByRole("group", { name: "Edit selected stamp" });
    expect(editor).toBeVisible();
    expect(editor.style.getPropertyValue("--editor-x")).toBe("120px");
    expect(editor.style.getPropertyValue("--editor-y")).toBe("180px");
    expect(editor).toHaveAttribute("data-layout", "radial");
    fireEvent.click(screen.getByRole("button", { name: "Make stamp larger" }));
    expect(onScale).toHaveBeenCalledWith(item, 1.1);
    fireEvent.click(
      screen.getByRole("button", { name: "Rotate stamp right 15 degrees" }),
    );
    expect(onRotate.mock.calls[0]?.[0]).toBe(item);
    expect(onRotate.mock.calls[0]?.[1]).toBeCloseTo(Math.PI / 12);
    const finish = screen.getByRole("button", { name: "Finish editing" });
    expect(finish).toHaveTextContent("✓");
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalled();
  });

  it("moves the radial controls with the selected item projection", () => {
    const props = {
      selectedEntityID: item.entityID,
      pending: false,
      dragging: null,
      onSelect: vi.fn(),
      onMove: vi.fn(),
      onRotate: vi.fn(),
      onScale: vi.fn(),
      onDelete: vi.fn(),
      onFinish: vi.fn(),
      onDragStateChange: vi.fn(),
    };
    const { rerender } = render(<LoungeItemEditor items={[item]} {...props} />);

    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Bolt stamp, yours; drag to move",
      }),
      { pointerId: 7, clientX: 120, clientY: 180 },
    );
    fireEvent.pointerMove(document, {
      pointerId: 7,
      clientX: 140,
      clientY: 200,
    });
    const movingEditor = screen.getByRole("group", {
      name: "Edit selected stamp",
    });
    expect(movingEditor.style.getPropertyValue("--editor-x")).toBe("140px");
    expect(movingEditor.style.getPropertyValue("--editor-y")).toBe("200px");
    fireEvent.pointerCancel(document, { pointerId: 7 });

    rerender(
      <LoungeItemEditor
        items={[{ ...item, screen: { x: 210, y: 95 } }]}
        {...props}
      />,
    );

    const editor = screen.getByRole("group", { name: "Edit selected stamp" });
    expect(editor.style.getPropertyValue("--editor-x")).toBe("210px");
    expect(editor.style.getPropertyValue("--editor-y")).toBe("95px");
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

  it("selects on a tap but ignores a slide until the item is selected", () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    render(
      <LoungeItemEditor
        items={[item]}
        selectedEntityID={null}
        pending={false}
        dragging={null}
        onSelect={onSelect}
        onMove={onMove}
        onRotate={vi.fn()}
        onScale={vi.fn()}
        onDelete={vi.fn()}
        onFinish={vi.fn()}
        onDragStateChange={vi.fn()}
      />,
    );
    const editable = screen.getByRole("button", {
      name: "Bolt stamp, yours; tap to edit",
    });

    fireEvent.pointerDown(editable, {
      pointerId: 1,
      clientX: 125,
      clientY: 185,
    });
    fireEvent.pointerMove(document, {
      pointerId: 1,
      clientX: 155,
      clientY: 215,
    });
    fireEvent.pointerUp(document, {
      pointerId: 1,
      clientX: 155,
      clientY: 215,
    });
    fireEvent.click(editable);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.pointerDown(editable, {
      pointerId: 2,
      clientX: 120,
      clientY: 180,
    });
    fireEvent.pointerUp(document, {
      pointerId: 2,
      clientX: 120,
      clientY: 180,
    });
    fireEvent.click(editable);
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("disables the browser's native drag gesture for image-backed items", () => {
    render(
      <LoungeItemEditor
        items={[{ ...item, imageSrc: "/team-lounge/items/wobble-cone-v1.png" }]}
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

    const artwork = document.querySelector(".team-lounge__item-art");
    expect(artwork).toHaveProperty("draggable", false);
    expect(fireEvent.dragStart(artwork!)).toBe(false);
  });

  it("can leave painting to Pixi while preserving the edit hit target", () => {
    render(
      <LoungeItemEditor
        items={[{ ...item, imageSrc: "/team-lounge/items/wobble-cone-v1.png" }]}
        paintArtwork={false}
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

    expect(
      screen.getByRole("button", { name: "Bolt stamp, yours; tap to edit" }),
    ).toBeVisible();
    expect(document.querySelector(".team-lounge__item-art")).toBeNull();
  });

  it("drags a selected item without reverting and reports a trash drop separately", () => {
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
    const editable = screen.getByRole("button", {
      name: "Bolt stamp, yours; drag to move",
    });

    fireEvent.pointerDown(editable, {
      pointerId: 1,
      clientX: 125,
      clientY: 185,
    });
    fireEvent.pointerMove(document, {
      pointerId: 1,
      clientX: 155,
      clientY: 215,
    });
    fireEvent.pointerUp(document, {
      pointerId: 1,
      clientX: 155,
      clientY: 215,
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
      name: "Bolt stamp, yours; drag to move",
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
