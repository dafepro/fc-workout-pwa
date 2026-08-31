import { routeNames, type RouteName } from "./route";

const activityNames = [
  "hill-sprints",
  "timed-run-walk",
  "distance-run",
  "recovery-walk-jog",
] as const;
type ActivityName = (typeof activityNames)[number];

type EmptyProperties = Record<never, never>;

export interface ProductEventProperties {
  app_visit_started: {
    display_mode: "standalone" | "browser";
    viewport: "small" | "medium" | "large";
    online: boolean;
  };
  route_summary: { route: RouteName; active_ms: number; views: number };
  connectivity_changed: { state: "online" | "offline" };
  app_installed: EmptyProperties;
  training_entry_started: {
    source: "home_assignment" | "fab" | "navigation";
    defaulted_activity: boolean;
  };
  training_activity_selected: {
    activity: ActivityName;
    defaulted_activity: boolean;
  };
  avatar_builder_opened: EmptyProperties;
  reaction_picker_opened: {
    context: "challenge" | "team_progress";
  };
  session_history_opened: EmptyProperties;
  cheer_inbox_opened: EmptyProperties;
  challenge_action_selected: { action: "open_log" | "open_reaction" };
  player_sign_in_succeeded: { remembered: boolean };
  player_sign_in_failed: {
    reason: "invalid" | "locked" | "busy" | "rate_limited" | "unavailable";
  };
  player_signed_out: EmptyProperties;
  training_entry_created: {
    activity: ActivityName;
    assignment_linked: boolean;
    backdate_days: number;
  };
  training_entry_rejected: {
    reason: "validation" | "forbidden" | "conflict" | "unavailable" | "other";
  };
  training_entry_deleted: {
    age_bucket: "under_hour" | "same_day" | "next_day" | "unknown";
  };
  reaction_created: {
    context: "challenge" | "team_progress";
    reaction:
      | "clap"
      | "fire"
      | "strong"
      | "hustle"
      | "runner"
      | "wind"
      | "robot-leg"
      | "do-it";
  };
  avatar_saved: EmptyProperties;
  product_operation_completed: {
    operation: "training_entry" | "reaction" | "avatar" | "session";
    outcome: "success" | "failure";
    latency: "under_250ms" | "under_1s" | "under_3s" | "over_3s";
  };
}

export type ProductEventName = keyof ProductEventProperties;

export const clientEventNames = [
  "app_visit_started",
  "route_summary",
  "connectivity_changed",
  "app_installed",
  "training_entry_started",
  "training_activity_selected",
  "avatar_builder_opened",
  "reaction_picker_opened",
  "session_history_opened",
  "cheer_inbox_opened",
  "challenge_action_selected",
] as const satisfies readonly ProductEventName[];

export type ClientEventName = (typeof clientEventNames)[number];
export type ServerEventName = Exclude<ProductEventName, ClientEventName>;

export type ClientEvent = {
  [Name in ClientEventName]: {
    id: string;
    visit_id: string;
    occurred_at: string;
    name: Name;
    properties: ProductEventProperties[Name];
  };
}[ClientEventName];

export interface ClientEventBatch {
  events: ClientEvent[];
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fiveMinutes = 5 * 60 * 1000;
const oneDay = 24 * 60 * 60 * 1000;

export function validateClientBatch(
  raw: unknown,
  now = new Date(),
): ClientEventBatch {
  const body = record(raw, "batch");
  exactKeys(body, ["events"], "batch");
  if (!Array.isArray(body.events)) throw new Error("events must be an array");
  if (body.events.length === 0 || body.events.length > 20) {
    throw new Error("a batch must contain between 1 and 20 events");
  }
  return { events: body.events.map((event) => clientEvent(event, now)) };
}

export function validateServerEvent<Name extends ServerEventName>(
  name: Name,
  raw: unknown,
): ProductEventProperties[Name] {
  if ((clientEventNames as readonly string[]).includes(name)) {
    throw new Error(`event name ${name} is client-owned`);
  }
  return propertiesFor(name, raw) as ProductEventProperties[Name];
}

function clientEvent(raw: unknown, now: Date): ClientEvent {
  const value = record(raw, "event");
  exactKeys(
    value,
    ["id", "visit_id", "occurred_at", "name", "properties"],
    "event",
  );
  if (typeof value.id !== "string" || !uuidPattern.test(value.id)) {
    throw new Error("event id must be a UUID");
  }
  if (typeof value.visit_id !== "string" || !uuidPattern.test(value.visit_id)) {
    throw new Error("visit id must be a UUID");
  }
  if (
    typeof value.name !== "string" ||
    !(clientEventNames as readonly string[]).includes(value.name)
  ) {
    throw new Error("event name is not allowed from the client");
  }
  if (typeof value.occurred_at !== "string") {
    throw new Error("event time must be an ISO timestamp");
  }
  const occurred = Date.parse(value.occurred_at);
  if (
    !Number.isFinite(occurred) ||
    occurred > now.getTime() + fiveMinutes ||
    occurred < now.getTime() - oneDay
  ) {
    throw new Error("event time is outside the accepted window");
  }
  const name = value.name as ClientEventName;
  return {
    id: value.id,
    visit_id: value.visit_id,
    occurred_at: new Date(occurred).toISOString(),
    name,
    properties: propertiesFor(name, value.properties),
  } as ClientEvent;
}

function propertiesFor(
  name: ProductEventName,
  raw: unknown,
): ProductEventProperties[ProductEventName] {
  const value = record(raw, `${name} properties`);
  switch (name) {
    case "app_visit_started":
      exactKeys(value, ["display_mode", "viewport", "online"], name);
      return {
        display_mode: oneOf(
          value.display_mode,
          ["standalone", "browser"],
          "display_mode",
        ),
        viewport: oneOf(
          value.viewport,
          ["small", "medium", "large"],
          "viewport",
        ),
        online: boolean(value.online, "online"),
      };
    case "route_summary":
      exactKeys(value, ["route", "active_ms", "views"], name);
      return {
        route: oneOf(value.route, routeNames, "route"),
        active_ms: integer(value.active_ms, 0, 600_000, "active_ms"),
        views: integer(value.views, 1, 100, "views"),
      };
    case "connectivity_changed":
      exactKeys(value, ["state"], name);
      return { state: oneOf(value.state, ["online", "offline"], "state") };
    case "app_installed":
    case "avatar_builder_opened":
    case "session_history_opened":
    case "cheer_inbox_opened":
    case "player_signed_out":
    case "avatar_saved":
      exactKeys(value, [], name);
      return {};
    case "training_entry_started":
      exactKeys(value, ["source", "defaulted_activity"], name);
      return {
        source: oneOf(
          value.source,
          ["home_assignment", "fab", "navigation"],
          "source",
        ),
        defaulted_activity: boolean(
          value.defaulted_activity,
          "defaulted_activity",
        ),
      };
    case "training_activity_selected":
      exactKeys(value, ["activity", "defaulted_activity"], name);
      return {
        activity: oneOf(value.activity, activityNames, "activity"),
        defaulted_activity: boolean(
          value.defaulted_activity,
          "defaulted_activity",
        ),
      };
    case "reaction_picker_opened":
      exactKeys(value, ["context"], name);
      return {
        context: oneOf(
          value.context,
          ["challenge", "team_progress"],
          "context",
        ),
      };
    case "challenge_action_selected":
      exactKeys(value, ["action"], name);
      return {
        action: oneOf(value.action, ["open_log", "open_reaction"], "action"),
      };
    case "player_sign_in_succeeded":
      exactKeys(value, ["remembered"], name);
      return { remembered: boolean(value.remembered, "remembered") };
    case "player_sign_in_failed":
      exactKeys(value, ["reason"], name);
      return {
        reason: oneOf(
          value.reason,
          ["invalid", "locked", "busy", "rate_limited", "unavailable"],
          "reason",
        ),
      };
    case "training_entry_created":
      exactKeys(
        value,
        ["activity", "assignment_linked", "backdate_days"],
        name,
      );
      return {
        activity: oneOf(value.activity, activityNames, "activity"),
        assignment_linked: boolean(
          value.assignment_linked,
          "assignment_linked",
        ),
        backdate_days: integer(value.backdate_days, 0, 7, "backdate_days"),
      };
    case "training_entry_rejected":
      exactKeys(value, ["reason"], name);
      return {
        reason: oneOf(
          value.reason,
          ["validation", "forbidden", "conflict", "unavailable", "other"],
          "reason",
        ),
      };
    case "training_entry_deleted":
      exactKeys(value, ["age_bucket"], name);
      return {
        age_bucket: oneOf(
          value.age_bucket,
          ["under_hour", "same_day", "next_day", "unknown"],
          "age_bucket",
        ),
      };
    case "reaction_created":
      exactKeys(value, ["context", "reaction"], name);
      return {
        context: oneOf(
          value.context,
          ["challenge", "team_progress"],
          "context",
        ),
        reaction: oneOf(
          value.reaction,
          [
            "clap",
            "fire",
            "strong",
            "hustle",
            "runner",
            "wind",
            "robot-leg",
            "do-it",
          ],
          "reaction",
        ),
      };
    case "product_operation_completed":
      exactKeys(value, ["operation", "outcome", "latency"], name);
      return {
        operation: oneOf(
          value.operation,
          ["training_entry", "reaction", "avatar", "session"],
          "operation",
        ),
        outcome: oneOf(value.outcome, ["success", "failure"], "outcome"),
        latency: oneOf(
          value.latency,
          ["under_250ms", "under_1s", "under_3s", "over_3s"],
          "latency",
        ),
      };
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new Error(`${label} properties do not match the catalog`);
  }
}

function oneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  label: string,
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new Error(`${label} is not an approved value`);
  }
  return value as Value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} is outside its allowed range`);
  }
  return value;
}
