import { describe, expect, it } from "vitest";
import {
  validateClientBatch,
  validateServerEvent,
  type ClientEventBatch,
} from "./catalog";

const NOW = new Date("2026-08-11T18:00:00.000Z");

function batch(
  name: ClientEventBatch["events"][number]["name"] = "route_summary",
  properties: Record<string, unknown> = {
    route: "home",
    active_ms: 12_000,
    views: 1,
  },
): unknown {
  return {
    events: [
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        visit_id: "123e4567-e89b-42d3-a456-426614174001",
        occurred_at: NOW.toISOString(),
        name,
        properties,
      },
    ],
  };
}

describe("validateClientBatch", () => {
  it("accepts bounded recovery intent without accepting identifiers or authoritative outcomes", () => {
    for (const action of ["retry", "confirmed", "unresolved"]) {
      expect(
        validateClientBatch(
          batch("training_save_recovery" as never, { action }),
          NOW,
        ).events[0].properties,
      ).toEqual({ action });
    }
    expect(() =>
      validateClientBatch(
        batch("training_save_recovery" as never, {
          action: "retry",
          entry_id: "private",
        }),
        NOW,
      ),
    ).toThrow();
    for (const name of [
      "planned_activity_recorded",
      "planned_rest_check_in_created",
      "prize_daily_claim_completed",
      "prize_box_opened",
    ]) {
      expect(() => validateClientBatch(batch(name as never, {}), NOW)).toThrow(
        /event name/i,
      );
    }
  });
  it("accepts a declared event and returns only its canonical shape", () => {
    expect(validateClientBatch(batch(), NOW)).toEqual({
      events: [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          visit_id: "123e4567-e89b-42d3-a456-426614174001",
          occurred_at: NOW.toISOString(),
          name: "route_summary",
          properties: { route: "home", active_ms: 12_000, views: 1 },
        },
      ],
    });
  });

  it.each(["distance", "effort", "exhaustion", "player_id", "url"])(
    "rejects the forbidden or unknown %s property",
    (property) => {
      expect(() =>
        validateClientBatch(
          batch("route_summary", {
            route: "home",
            active_ms: 12_000,
            views: 1,
            [property]: "private",
          }),
          NOW,
        ),
      ).toThrow(/properties/i);
    },
  );

  it("rejects server-owned event names from the browser", () => {
    expect(() =>
      validateClientBatch(batch("training_entry_created" as never, {}), NOW),
    ).toThrow(/event name/i);
  });

  it("bounds batches, clocks, ids, enums, and durations", () => {
    const valid = batch() as ClientEventBatch;
    expect(() =>
      validateClientBatch(
        { events: Array.from({ length: 21 }, () => valid.events[0]) },
        NOW,
      ),
    ).toThrow(/20/);
    expect(() =>
      validateClientBatch(
        {
          events: [
            {
              ...valid.events[0],
              occurred_at: "2026-08-11T18:06:00.000Z",
            },
          ],
        },
        NOW,
      ),
    ).toThrow(/time/i);
    expect(() =>
      validateClientBatch(
        {
          events: [{ ...valid.events[0], visit_id: "player-secret" }],
        },
        NOW,
      ),
    ).toThrow(/visit/i);
    expect(() =>
      validateClientBatch(
        batch("route_summary", {
          route: "player-secret",
          active_ms: 12_000,
          views: 1,
        }),
        NOW,
      ),
    ).toThrow(/route/i);
    expect(() =>
      validateClientBatch(
        batch("route_summary", {
          route: "home",
          active_ms: 600_001,
          views: 1,
        }),
        NOW,
      ),
    ).toThrow(/active_ms/i);
  });
});

describe("validateServerEvent", () => {
  it("rejects raw identifiers and values on plan and prize outcomes", () => {
    expect(
      validateServerEvent("planned_activity_recorded" as never, {
        completion: "partial",
      }),
    ).toEqual({ completion: "partial" });
    expect(
      validateServerEvent("prize_box_opened" as never, { outcome: "existing" }),
    ).toEqual({ outcome: "existing" });
    expect(() =>
      validateServerEvent("planned_activity_recorded" as never, {
        completion: "partial",
        result: 8,
      }),
    ).toThrow();
    expect(() =>
      validateServerEvent("prize_box_opened" as never, {
        outcome: "created",
        item_id: "private",
      }),
    ).toThrow();
  });
  it("accepts declared authoritative outcomes", () => {
    expect(
      validateServerEvent("training_entry_created", {
        activity: "hill-sprints",
        assignment_linked: true,
        backdate_days: 0,
      }),
    ).toEqual({
      activity: "hill-sprints",
      assignment_linked: true,
      backdate_days: 0,
    });
  });

  it("refuses raw performance and feeling values", () => {
    expect(() =>
      validateServerEvent("training_entry_created", {
        activity: "hill-sprints",
        assignment_linked: true,
        backdate_days: 0,
        repetitions: 8,
        effort: 4,
      }),
    ).toThrow(/properties/i);
  });
});
