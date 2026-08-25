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

  it("accepts name-free bounded Team Canvas health buckets", () => {
    expect(
      validateClientBatch(
        batch("team_canvas_health_sample", {
          connection: "connected",
          reconnects: 1,
          input_latency: "under_150ms",
          correction: "under_1",
          host_epoch: 2,
          dropped_frames: 3,
          checkpoint_age: "under_30s",
        }),
        NOW,
      ).events[0].properties,
    ).not.toHaveProperty("player_id");
  });

  it("accepts only a bounded reward destination without item identity", () => {
    expect(
      validateClientBatch(
        batch("reward_destination_opened", {
          destination: "team_lounge",
          item_kind: "stamp",
        }),
        NOW,
      ).events[0].properties,
    ).toEqual({ destination: "team_lounge", item_kind: "stamp" });
    expect(() =>
      validateClientBatch(
        batch("reward_destination_opened", {
          destination: "team_lounge",
          item_kind: "stamp",
          item_id: "private-unlock",
        }),
        NOW,
      ),
    ).toThrow(/properties/i);
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

  it.each([
    [
      "today_requirement_recorded",
      { source: "coach_plan", kind: "training", outcome: "success" },
    ],
    ["prize_box_operation", { action: "open", outcome: "unavailable" }],
    ["team_reward_reported", { outcome: "created" }],
    ["staff_plan_operation", { action: "reschedule", outcome: "conflict" }],
    [
      "staff_reward_operation",
      { action: "resolve_report", outcome: "success" },
    ],
  ] as const)("accepts the bounded %s outcome", (name, properties) => {
    expect(validateServerEvent(name, properties)).toEqual(properties);
  });

  it("refuses identities and content on major feature outcomes", () => {
    expect(() =>
      validateServerEvent("staff_reward_operation", {
        action: "create",
        outcome: "success",
        team_id: "private-team",
        prize_text: "pizza party",
      }),
    ).toThrow(/properties/i);
  });
});
