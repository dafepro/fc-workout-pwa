import { describe, expect, it } from "vitest";

import { staffProxyEvents } from "./staff-proxy-events";

describe("staffProxyEvents", () => {
  it.each([
    [
      "v1/staff/teams/team-one/training-plans",
      201,
      {
        name: "staff_plan_operation",
        properties: { action: "publish", outcome: "success" },
      },
    ],
    [
      "v1/staff/teams/team-one/training-plans/plan-one/reschedule",
      409,
      {
        name: "staff_plan_operation",
        properties: { action: "reschedule", outcome: "conflict" },
      },
    ],
    [
      "v1/staff/teams/team-one/rewards",
      201,
      {
        name: "staff_reward_operation",
        properties: { action: "create", outcome: "success" },
      },
    ],
    [
      "v1/staff/reward-reports/report-one/resolve",
      200,
      {
        name: "staff_reward_operation",
        properties: { action: "resolve_report", outcome: "success" },
      },
    ],
  ] as const)(
    "projects %s without resource identity",
    (path, status, expected) => {
      const events = staffProxyEvents("POST", path, status);
      expect(events).toEqual([expected]);
      expect(JSON.stringify(events)).not.toMatch(
        /team-one|plan-one|report-one/,
      );
    },
  );

  it("ignores reads and reward media uploads", () => {
    expect(
      staffProxyEvents("GET", "v1/staff/teams/team-one/training-plans", 200),
    ).toEqual([]);
    expect(
      staffProxyEvents("POST", "v1/staff/teams/team-one/reward-media", 201),
    ).toEqual([]);
  });
});
