import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { timeBucket } from "./storage";

const analyticsMigrationPath = join(
  process.cwd(),
  "drizzle/0001_product_analytics.sql",
);

describe("analytics schema", () => {
  it("accepts privacy-safe events and rejects invalid local hours", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(readFileSync(analyticsMigrationPath, "utf8"));
    const insert = database.prepare(`
      INSERT INTO analytics_events (
        event_id, source, event_name, received_at, occurred_at,
        subject_key, team_key, visit_id, route_name, active_ms,
        local_day, local_hour, properties_json
      ) VALUES (?, 'client', 'route_summary', 1, 1, ?, ?, ?, 'home', 20, '2026-08-11', ?, '{}')
    `);

    insert.run("event-1", "subject-hash", "team-hash", "visit-1", 13);
    expect(() =>
      insert.run("event-2", "subject-hash", "team-hash", "visit-1", 24),
    ).toThrow();
  });

  it("does not define columns for direct identity or request fingerprints", () => {
    const sql = readFileSync(analyticsMigrationPath, "utf8");
    for (const forbidden of [
      "first_name",
      "last_name",
      "email",
      "ip_address",
      "user_agent",
      "raw_url",
    ]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("timeBucket", () => {
  it("uses the team's local day and hour", () => {
    expect(
      timeBucket(new Date("2026-08-12T01:30:00.000Z"), "America/Chicago"),
    ).toEqual({ localDay: "2026-08-11", localHour: 20 });
  });

  it("falls back to UTC for an invalid zone", () => {
    expect(timeBucket(new Date("2026-08-12T01:30:00.000Z"), "invalid")).toEqual(
      { localDay: "2026-08-12", localHour: 1 },
    );
  });
});
