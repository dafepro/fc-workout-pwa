import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { validateClientBatch } from "../../../lib/analytics/catalog";
import {
  insertClientBatch,
  readAnalyticsOverview,
} from "../../../lib/analytics/storage";

describe("client metrics ingestion", () => {
  it("validates a client batch, stores it, and exposes only aggregate route use", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
      readFileSync(
        join(process.cwd(), "drizzle/0001_product_analytics.sql"),
        "utf8",
      ),
    );
    const database = d1Database(sqlite);
    const now = new Date();
    const batch = validateClientBatch(
      {
        events: [
          {
            id: crypto.randomUUID(),
            visit_id: crypto.randomUUID(),
            occurred_at: now.toISOString(),
            name: "route_summary",
            properties: {
              route: "prize_boxes",
              active_ms: 120_000,
              views: 1,
            },
          },
        ],
      },
      now,
    );
    await insertClientBatch(
      database,
      batch,
      {
        subjectKey: "pseudonymous-subject",
        teamKey: "pseudonymous-team",
        timeZone: "America/Chicago",
      },
      now,
    );
    const overview = await readAnalyticsOverview(
      database,
      new Date(now.getTime() + 1_000),
    );
    expect(overview).toMatchObject({
      activeToday: 1,
      active7Days: 1,
      activeMinutes7Days: 2,
      rowsLast24Hours: 1,
      topRoutes: [{ route: "prize_boxes", activeMinutes: 2, visits: 1 }],
    });
    const stored = sqlite
      .prepare(
        "SELECT event_name, route_name, properties_json FROM analytics_events",
      )
      .get() as Record<string, unknown>;
    expect(stored).toEqual({
      event_name: "route_summary",
      route_name: "prize_boxes",
      properties_json: JSON.stringify({
        route: "prize_boxes",
        active_ms: 120_000,
        views: 1,
      }),
    });
  });
});

function d1Database(sqlite: DatabaseSync): D1Database {
  function prepared(
    sql: string,
    bindings: unknown[] = [],
  ): D1PreparedStatement {
    const statement = sqlite.prepare(sql);
    return {
      bind(...values: unknown[]) {
        return prepared(sql, values);
      },
      async first<T>() {
        return (
          (statement.get(...(bindings as never[])) as T | undefined) ?? null
        );
      },
      async all<T>() {
        return {
          results: statement.all(...(bindings as never[])) as T[],
        } as D1Result<T>;
      },
      async run<T>() {
        statement.run(...(bindings as never[]));
        return { success: true, results: [] } as unknown as D1Result<T>;
      },
    } as D1PreparedStatement;
  }
  return {
    prepare: prepared,
    async batch<T>(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
  } as unknown as D1Database;
}
