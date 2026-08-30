import { describe, expect, it } from "vitest";
import { buildDatedPlan, type TrainingPlanTemplate } from "./model";

const template: TrainingPlanTemplate = {
  id: "test-plan-v1",
  version: 1,
  name: "Test plan",
  summary: "Seven days",
  days: Array.from({ length: 7 }, (_, offset) => ({
    offset,
    kind: offset === 3 ? "rest" : "training",
    focus: offset === 3 ? "recovery" : "endurance",
    durationMinutes: offset === 3 ? 0 : 15,
    intensity: "easy",
    blocks:
      offset === 3
        ? []
        : [
            {
              activityDefinitionId: "timed-run-walk",
              label: "Timed run or walk",
              durationMinutes: 15,
            },
          ],
  })),
};

describe("training plan calendar preview", () => {
  it("dates the backend-owned sequence without changing its intent", () => {
    const preview = buildDatedPlan(template, "2026-08-24");

    expect(preview[0]).toMatchObject({
      date: "2026-08-24",
      dayLabel: "Mon, Aug 24",
    });
    expect(preview[6]).toMatchObject({
      date: "2026-08-30",
      dayLabel: "Sun, Aug 30",
    });
    expect(preview.map(({ kind }) => kind)).toEqual(
      template.days.map(({ kind }) => kind),
    );
  });
});
