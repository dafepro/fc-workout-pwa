import { describe, expect, it, vi } from "vitest";

import { performLoungeItemMutation } from "./lounge-item-mutations";

const item = {
  entityID: "canvas-item-one",
  itemRevision: 3,
  transform: { x: 20, y: 70, rotation: 0, scale: 1 },
};

describe("permit-backed Lounge item mutations", () => {
  it.each([
    ["transform", { x: 25, y: 75, rotation: 0, scale: 1 }, "moveItem"],
    ["rotation", { x: 20, y: 70, rotation: 0.5, scale: 1 }, "rotateItem"],
    ["scale", { x: 20, y: 70, rotation: 0, scale: 1.2 }, "scaleItem"],
    ["delete", null, "deleteItem"],
  ] as const)(
    "requests an exact %s permit before calling Canvas",
    async (kind, transform, runtimeMethod) => {
      const events: string[] = [];
      const requestPermit = vi.fn(async () => {
        events.push("permit");
        return {
          mutationPermitID: `lounge-mutation-${"a".repeat(32)}`,
          permit: "p".repeat(43),
          entityID: item.entityID,
          itemRevision: item.itemRevision,
          kind,
          currentTransform: item.transform,
          transform,
        };
      });
      const accepted = {
        settled: Promise.resolve({
          status: "accepted" as const,
          mutationId: 1,
          sceneRevision: 4,
          itemRevision: 4,
        }),
      };
      const runtime = {
        moveItem: vi.fn(() => {
          events.push("canvas");
          return accepted;
        }),
        rotateItem: vi.fn(() => {
          events.push("canvas");
          return accepted;
        }),
        scaleItem: vi.fn(() => {
          events.push("canvas");
          return accepted;
        }),
        deleteItem: vi.fn(() => {
          events.push("canvas");
          return accepted;
        }),
      };

      await expect(
        performLoungeItemMutation({
          runtime,
          requestPermit,
          teamID: "team-one",
          roomID: "team:team-one:lounge:2026-08-24:v10",
          item,
          kind,
          transform,
          idempotencyKey: `${kind}-one`,
        }),
      ).resolves.toMatchObject({
        outcome: { status: "accepted" },
        currentTransform: item.transform,
        targetTransform: transform,
      });

      expect(events).toEqual(["permit", "canvas"]);
      expect(requestPermit).toHaveBeenCalledWith(
        "team-one",
        "team:team-one:lounge:2026-08-24:v10",
        item.entityID,
        item.itemRevision,
        kind,
        transform,
        `${kind}-one`,
      );
      expect(runtime[runtimeMethod]).toHaveBeenCalledTimes(1);
      const call = runtime[runtimeMethod].mock.calls[0] as unknown[];
      expect(call[0]).toBe(item.entityID);
      expect(call.at(-1)).toMatchObject({
        applicationCorrelationId: `lounge-mutation-${"a".repeat(32)}`,
      });
      expect(
        (call.at(-1) as { authorizationEvidence: Uint8Array })
          .authorizationEvidence,
      ).toEqual(new TextEncoder().encode("p".repeat(43)));
    },
  );

  it("never calls Canvas when ZoomiGo refuses the permit", async () => {
    const runtime = {
      moveItem: vi.fn(),
      rotateItem: vi.fn(),
      scaleItem: vi.fn(),
      deleteItem: vi.fn(),
    };

    await expect(
      performLoungeItemMutation({
        runtime,
        requestPermit: vi.fn().mockRejectedValue(new Error("not editable")),
        teamID: "team-one",
        roomID: "team:team-one:lounge:2026-08-24:v10",
        item,
        kind: "transform",
        transform: { ...item.transform, x: 25 },
        idempotencyKey: "move-refused",
      }),
    ).rejects.toThrow("not editable");
    expect(runtime.moveItem).not.toHaveBeenCalled();
  });
});
