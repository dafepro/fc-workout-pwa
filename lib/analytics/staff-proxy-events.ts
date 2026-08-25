import type { ProjectedServerEvent } from "./proxy-events";

export function staffProxyEvents(
  method: string,
  path: string,
  status: number,
): ProjectedServerEvent[] {
  if (method !== "POST") return [];
  const outcome = featureOutcome(status);
  const plan = path.match(
    /^v1\/staff\/teams\/[^/]+\/training-plans(?:\/[^/]+\/(cancel|reschedule))?$/,
  );
  if (plan) {
    return [
      {
        name: "staff_plan_operation",
        properties: {
          action: (plan[1] ?? "publish") as "publish" | "cancel" | "reschedule",
          outcome,
        },
      },
    ];
  }
  const reward = path.match(
    /^v1\/staff\/teams\/[^/]+\/rewards(?:\/[^/]+\/(publish|cancel))?$/,
  );
  if (reward) {
    return [
      {
        name: "staff_reward_operation",
        properties: {
          action: (reward[1] ?? "create") as "create" | "publish" | "cancel",
          outcome,
        },
      },
    ];
  }
  if (/^v1\/staff\/reward-reports\/[^/]+\/resolve$/.test(path)) {
    return [
      {
        name: "staff_reward_operation",
        properties: { action: "resolve_report", outcome },
      },
    ];
  }
  return [];
}

function featureOutcome(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status === 409) return "conflict" as const;
  if (status >= 500) return "unavailable" as const;
  return "rejected" as const;
}
