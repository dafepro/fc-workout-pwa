import type { ProductEventProperties, ServerEventName } from "./catalog";

export type ProjectedServerEvent = {
  [Name in ServerEventName]: {
    name: Name;
    properties: ProductEventProperties[Name];
  };
}[ServerEventName];

const activities = new Set([
  "hill-sprints",
  "timed-run-walk",
  "distance-run",
  "recovery-walk-jog",
]);
const reactionContexts = new Set(["challenge", "team_progress", "leaderboard"]);
const reactions = new Set([
  "clap",
  "fire",
  "strong",
  "hustle",
  "runner",
  "wind",
  "robot-leg",
  "do-it",
]);

export function proxyEvents(
  method: string,
  path: string,
  rawBody: string | undefined,
  status: number,
  elapsedMs: number,
  now = new Date(),
): ProjectedServerEvent[] {
  const successful = status >= 200 && status < 300;
  const payload = parseBody(rawBody);
  let outcome: ProjectedServerEvent | null = null;
  let featureOutcome: ProjectedServerEvent | null = null;
  let operation: "training_entry" | "reaction" | "avatar" | null = null;
  if (method === "POST" && path === "v1/me/training-entries") {
    operation = "training_entry";
    if (!successful) {
      outcome = {
        name: "training_entry_rejected",
        properties: { reason: rejectionReason(status) },
      };
    } else {
      const activity = stringProperty(payload, "activityDefinitionId");
      if (activities.has(activity)) {
        outcome = {
          name: "training_entry_created",
          properties: {
            activity:
              activity as ProductEventProperties["training_entry_created"]["activity"],
            assignment_linked:
              typeof payload.assignmentId === "string" &&
              payload.assignmentId.length > 0,
            backdate_days: backdateDays(payload.occurredAt, now),
          },
        };
      }
    }
    featureOutcome = {
      name: "today_requirement_recorded",
      properties: {
        source:
          payload.plan && typeof payload.plan === "object"
            ? "coach_plan"
            : typeof payload.assignmentId === "string" && payload.assignmentId
              ? "team_default"
              : "unplanned",
        kind: "training",
        outcome: featureStatus(status),
      },
    };
  } else if (
    method === "POST" &&
    /^v1\/teams\/[^/]+\/canvas\/rest$/.test(path)
  ) {
    featureOutcome = {
      name: "today_requirement_recorded",
      properties: {
        source: "coach_plan",
        kind: "recovery",
        outcome: featureStatus(status),
      },
    };
  } else if (
    method === "POST" &&
    (path === "v1/me/prize-boxes/claim-daily" ||
      /^v1\/me\/prize-boxes\/[^/]+\/open$/.test(path))
  ) {
    featureOutcome = {
      name: "prize_box_operation",
      properties: {
        action: path.endsWith("/claim-daily") ? "claim" : "open",
        outcome: featureStatus(status),
      },
    };
  } else if (
    method === "POST" &&
    /^v1\/teams\/[^/]+\/rewards\/[^/]+\/reports$/.test(path)
  ) {
    featureOutcome = {
      name: "team_reward_reported",
      properties: { outcome: reportStatus(status) },
    };
  } else if (
    method === "DELETE" &&
    /^v1\/training-entries\/[^/]+$/.test(path) &&
    successful
  ) {
    operation = "training_entry";
    outcome = {
      name: "training_entry_deleted",
      properties: { age_bucket: "unknown" },
    };
  } else if (method === "POST" && path === "v1/reactions") {
    operation = "reaction";
    const context = stringProperty(payload, "context");
    const reaction = stringProperty(payload, "reactionType").replaceAll(
      "_",
      "-",
    );
    if (
      successful &&
      reactionContexts.has(context) &&
      reactions.has(reaction)
    ) {
      outcome = {
        name: "reaction_created",
        properties: {
          context:
            context as ProductEventProperties["reaction_created"]["context"],
          reaction:
            reaction as ProductEventProperties["reaction_created"]["reaction"],
        },
      };
    }
  } else if (method === "PUT" && path === "v1/me/avatar") {
    operation = "avatar";
    if (successful) outcome = { name: "avatar_saved", properties: {} };
  }
  const events: ProjectedServerEvent[] = [];
  if (outcome) events.push(outcome);
  if (featureOutcome) events.push(featureOutcome);
  if (!operation) return events;
  const completion: ProjectedServerEvent = {
    name: "product_operation_completed",
    properties: {
      operation,
      outcome: successful ? "success" : "failure",
      latency: latencyBucket(elapsedMs),
    },
  };
  return [...events, completion];
}

function parseBody(rawBody: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(rawBody ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}

function backdateDays(value: unknown, now: Date): number {
  if (typeof value !== "string") return 0;
  const occurredAt = new Date(value);
  if (!Number.isFinite(occurredAt.getTime())) return 0;
  return Math.max(
    0,
    Math.min(
      7,
      Math.floor((now.getTime() - occurredAt.getTime()) / 86_400_000),
    ),
  );
}

function rejectionReason(
  status: number,
): ProductEventProperties["training_entry_rejected"]["reason"] {
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status >= 500) return "unavailable";
  return "other";
}

function latencyBucket(
  elapsedMs: number,
): ProductEventProperties["product_operation_completed"]["latency"] {
  if (elapsedMs < 250) return "under_250ms";
  if (elapsedMs < 1_000) return "under_1s";
  if (elapsedMs < 3_000) return "under_3s";
  return "over_3s";
}

function featureStatus(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status === 409) return "conflict" as const;
  if (status >= 500) return "unavailable" as const;
  return "rejected" as const;
}

function reportStatus(status: number) {
  if (status >= 200 && status < 300) return "created" as const;
  if (status === 409) return "duplicate" as const;
  if (status >= 500) return "unavailable" as const;
  return "rejected" as const;
}
