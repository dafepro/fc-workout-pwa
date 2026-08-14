import type { ClientEventBatch, ServerEventName } from "./catalog";
import type { RouteName } from "./route";

export interface AnalyticsIdentity {
  subjectKey: string;
  teamKey: string | null;
  timeZone: string;
}

interface StoredEvent {
  eventId: string;
  source: "client" | "server";
  eventName: string;
  occurredAt: Date;
  identity: AnalyticsIdentity | null;
  visitId: string | null;
  routeName: RouteName | null;
  activeMs: number | null;
  properties: Record<string, unknown>;
  sampleWeight?: number;
}

export interface AnalyticsOverview {
  activeToday: number;
  active7Days: number;
  active30Days: number;
  activeMinutes7Days: number;
  trainingEntries7Days: number;
  reactions7Days: number;
  rowsLast24Hours: number;
  estimatedDailyWrites: number;
  capacityPercent: number;
  topRoutes: { route: string; activeMinutes: number; visits: number }[];
  localHours: { hour: number; events: number }[];
}

let overviewCache:
  | { database: D1Database; expiresAt: number; value: AnalyticsOverview }
  | undefined;

export function timeBucket(
  occurredAt: Date,
  timeZone: string,
): { localDay: string; localHour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(occurredAt);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return {
      localDay: `${value("year")}-${value("month")}-${value("day")}`,
      localHour: Number(value("hour")),
    };
  } catch {
    return {
      localDay: occurredAt.toISOString().slice(0, 10),
      localHour: occurredAt.getUTCHours(),
    };
  }
}

export async function insertClientBatch(
  database: D1Database,
  batch: ClientEventBatch,
  identity: AnalyticsIdentity,
  receivedAt = new Date(),
): Promise<void> {
  await insertEvents(
    database,
    batch.events.map((event) => ({
      eventId: event.id,
      source: "client",
      eventName: event.name,
      occurredAt: new Date(event.occurred_at),
      identity,
      visitId: event.visit_id,
      routeName:
        event.name === "route_summary"
          ? (event.properties.route as RouteName)
          : null,
      activeMs:
        event.name === "route_summary" ? event.properties.active_ms : null,
      properties: event.properties,
    })),
    receivedAt,
  );
}

export async function insertServerEvent(
  database: D1Database,
  name: ServerEventName,
  properties: Record<string, unknown>,
  identity: AnalyticsIdentity | null,
  occurredAt = new Date(),
): Promise<void> {
  await insertEvents(
    database,
    [
      {
        eventId: crypto.randomUUID(),
        source: "server",
        eventName: name,
        occurredAt,
        identity,
        visitId: null,
        routeName: null,
        activeMs: null,
        properties,
      },
    ],
    occurredAt,
  );
}

async function insertEvents(
  database: D1Database,
  events: StoredEvent[],
  receivedAt: Date,
): Promise<void> {
  const statement = database.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      event_id, source, event_name, received_at, occurred_at,
      subject_key, team_key, visit_id, route_name, active_ms,
      local_day, local_hour, properties_json, sample_weight
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await database.batch(
    events.map((event) => {
      const bucket = timeBucket(
        event.occurredAt,
        event.identity?.timeZone ?? "UTC",
      );
      return statement.bind(
        event.eventId,
        event.source,
        event.eventName,
        receivedAt.getTime(),
        event.occurredAt.getTime(),
        event.identity?.subjectKey ?? null,
        event.identity?.teamKey ?? null,
        event.visitId,
        event.routeName,
        event.activeMs,
        bucket.localDay,
        bucket.localHour,
        JSON.stringify(event.properties),
        event.sampleWeight ?? 1,
      );
    }),
  );
}

export async function readAnalyticsOverview(
  database: D1Database,
  now = new Date(),
): Promise<AnalyticsOverview> {
  const end = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const summary = await database
    .prepare(
      `
      SELECT
        COUNT(DISTINCT CASE WHEN received_at >= ? THEN subject_key END) AS active_today,
        COUNT(DISTINCT CASE WHEN received_at >= ? THEN subject_key END) AS active_7_days,
        COUNT(DISTINCT CASE WHEN received_at >= ? THEN subject_key END) AS active_30_days,
        COALESCE(SUM(CASE WHEN event_name = 'route_summary' AND received_at >= ? THEN active_ms ELSE 0 END), 0) AS active_ms_7_days,
        SUM(CASE WHEN event_name = 'training_entry_created' AND received_at >= ? THEN 1 ELSE 0 END) AS entries_7_days,
        SUM(CASE WHEN event_name = 'reaction_created' AND received_at >= ? THEN 1 ELSE 0 END) AS reactions_7_days,
        SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS rows_24_hours
      FROM analytics_events
      WHERE received_at >= ?
    `,
    )
    .bind(
      end - day,
      end - 7 * day,
      end - 30 * day,
      end - 7 * day,
      end - 7 * day,
      end - 7 * day,
      end - day,
      end - 30 * day,
    )
    .first<Record<string, number>>();
  const routes = await database
    .prepare(
      `
      SELECT route_name AS route, SUM(active_ms) AS active_ms, COUNT(*) AS visits
      FROM analytics_events
      WHERE event_name = 'route_summary' AND received_at >= ? AND route_name IS NOT NULL
      GROUP BY route_name ORDER BY active_ms DESC LIMIT 8
    `,
    )
    .bind(end - 7 * day)
    .all<{ route: string; active_ms: number; visits: number }>();
  const hours = await database
    .prepare(
      `
      SELECT local_hour AS hour, COUNT(*) AS events
      FROM analytics_events
      WHERE received_at >= ? AND local_hour IS NOT NULL
      GROUP BY local_hour ORDER BY local_hour
    `,
    )
    .bind(end - 30 * day)
    .all<{ hour: number; events: number }>();
  const rowsLast24Hours = Number(summary?.rows_24_hours ?? 0);
  // Three indexes make an insert about four billed writes; once retention is
  // mature, deleting the expired row and its index entries roughly doubles it.
  const estimatedDailyWrites = rowsLast24Hours * 9;
  return {
    activeToday: Number(summary?.active_today ?? 0),
    active7Days: Number(summary?.active_7_days ?? 0),
    active30Days: Number(summary?.active_30_days ?? 0),
    activeMinutes7Days: Math.round(
      Number(summary?.active_ms_7_days ?? 0) / 60_000,
    ),
    trainingEntries7Days: Number(summary?.entries_7_days ?? 0),
    reactions7Days: Number(summary?.reactions_7_days ?? 0),
    rowsLast24Hours,
    estimatedDailyWrites,
    capacityPercent: Math.min(100, Math.round(estimatedDailyWrites / 1000)),
    topRoutes: routes.results.map((row) => ({
      route: row.route,
      activeMinutes: Math.round(Number(row.active_ms) / 60_000),
      visits: Number(row.visits),
    })),
    localHours: hours.results.map((row) => ({
      hour: Number(row.hour),
      events: Number(row.events),
    })),
  };
}

export async function readCachedAnalyticsOverview(
  database: D1Database,
  now = new Date(),
): Promise<AnalyticsOverview> {
  if (
    overviewCache?.database === database &&
    overviewCache.expiresAt > now.getTime()
  ) {
    return overviewCache.value;
  }
  const value = await readAnalyticsOverview(database, now);
  overviewCache = {
    database,
    expiresAt: now.getTime() + 5 * 60 * 1000,
    value,
  };
  return value;
}

export async function pruneAnalytics(
  database: D1Database,
  now = new Date(),
  retentionDays = 90,
): Promise<void> {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  await database
    .prepare(
      `
      DELETE FROM analytics_events
      WHERE event_id IN (
        SELECT event_id FROM analytics_events
        WHERE received_at < ? ORDER BY received_at LIMIT 10000
      )
    `,
    )
    .bind(cutoff)
    .run();
}
