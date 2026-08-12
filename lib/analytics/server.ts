import { env } from "cloudflare:workers";
import { backendBaseURL, readSessionCookie } from "../../app/api/backend";
import type {
  ClientEventBatch,
  ProductEventProperties,
  ServerEventName,
} from "./catalog";
import {
  insertClientBatch,
  insertServerEvent,
  type AnalyticsIdentity,
} from "./storage";
import { identityForSession, type AnalyticsSession } from "./identity";
import type { ProjectedServerEvent } from "./proxy-events";

export { identityForSession, pseudonymize } from "./identity";
export type { AnalyticsSession } from "./identity";

interface AnalyticsEnv {
  ANALYTICS_DB?: D1Database;
  PRODUCT_ANALYTICS_ENABLED?: string;
  ANALYTICS_SUBJECT_KEY?: string;
}

export function analyticsDatabase(): D1Database | null {
  const binding = env as AnalyticsEnv;
  return binding.PRODUCT_ANALYTICS_ENABLED === "true" &&
    binding.ANALYTICS_DB &&
    validSubjectKey(binding.ANALYTICS_SUBJECT_KEY)
    ? binding.ANALYTICS_DB
    : null;
}

export function analyticsConfigured(): boolean {
  return analyticsDatabase() !== null;
}

function subjectKey(): string | null {
  const value = (env as AnalyticsEnv).ANALYTICS_SUBJECT_KEY;
  return validSubjectKey(value) ? value : null;
}

function validSubjectKey(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 32;
}

export async function analyticsIdentityForRequest(
  request: Request,
): Promise<AnalyticsIdentity | null> {
  const key = subjectKey();
  const baseURL = backendBaseURL();
  const token = readSessionCookie(request);
  if (!key || !baseURL || !token) return null;
  try {
    const response = await fetch(`${baseURL}/v1/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return identityForSession((await response.json()) as AnalyticsSession, key);
  } catch {
    return null;
  }
}

export async function recordClientBatch(
  request: Request,
  batch: ClientEventBatch,
): Promise<"stored" | "disabled" | "unauthenticated"> {
  const database = analyticsDatabase();
  if (!database) return "disabled";
  const identity = await analyticsIdentityForRequest(request);
  if (!identity) return "unauthenticated";
  await insertClientBatch(database, batch, identity);
  return "stored";
}

export async function recordServerEvent<Name extends ServerEventName>(
  session: AnalyticsSession,
  name: Name,
  properties: ProductEventProperties[Name],
): Promise<void> {
  const database = analyticsDatabase();
  const key = subjectKey();
  if (!database || !key) return;
  try {
    await insertServerEvent(
      database,
      name,
      properties,
      await identityForSession(session, key),
    );
  } catch {
    // Product analytics is deliberately fail-open: it must never block the app.
  }
}

export async function recordAnonymousServerEvent<Name extends ServerEventName>(
  name: Name,
  properties: ProductEventProperties[Name],
): Promise<void> {
  const database = analyticsDatabase();
  if (!database) return;
  try {
    await insertServerEvent(database, name, properties, null);
  } catch {
    // Product analytics is deliberately fail-open: it must never block the app.
  }
}

export async function recordServerEventForRequest<Name extends ServerEventName>(
  request: Request,
  name: Name,
  properties: ProductEventProperties[Name],
): Promise<void> {
  const database = analyticsDatabase();
  if (!database) return;
  try {
    await insertServerEvent(
      database,
      name,
      properties,
      await analyticsIdentityForRequest(request),
    );
  } catch {
    // Product analytics is deliberately fail-open: it must never block the app.
  }
}

export async function recordServerEventsForRequest(
  request: Request,
  events: readonly ProjectedServerEvent[],
): Promise<void> {
  const database = analyticsDatabase();
  if (!database || events.length === 0) return;
  try {
    const identity = await analyticsIdentityForRequest(request);
    for (const event of events) {
      await insertServerEvent(
        database,
        event.name,
        event.properties as never,
        identity,
      );
    }
  } catch {
    // Product analytics is deliberately fail-open: it must never block the app.
  }
}
