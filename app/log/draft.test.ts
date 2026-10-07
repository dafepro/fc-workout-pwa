import { expect, it } from "vitest";
import { isTrainingDraft } from "./draft";

const input = {
  activityId: "hill-sprints",
  inputKind: "repetitions",
  occurredAt: "2026-01-01T12:00:00Z",
  value: 7,
  unit: "reps",
  effortLevel: 4,
  exhaustionLevel: 3,
  completionOutcome: "as_listed",
};
const draft = {
  selection: { activityId: "hill-sprints", value: 7 },
  date: "2026-01-01",
  time: "12:00",
  effort: 4,
  exhaustion: 3,
  completionOutcome: "as_listed",
};
it("retains the shape of an original attempt independently of current calendar rules", () => {
  expect(
    isTrainingDraft({
      ...draft,
      attempt: { key: "attempt-one", fingerprint: JSON.stringify(input) },
    }),
  ).toBe(true);
});
it.each([
  "{",
  "null",
  "[]",
  "{}",
  JSON.stringify({ ...input, value: "7" }),
  JSON.stringify({ ...input, occurredAt: "bad" }),
  JSON.stringify({ ...input, completionOutcome: "invented" }),
  JSON.stringify({ ...input, plan: { planId: "old-plan" } }),
])(
  "rejects a malformed stored attempt instead of freezing or forwarding it: %s",
  (fingerprint) => {
    expect(
      isTrainingDraft({
        ...draft,
        attempt: { key: "attempt-one", fingerprint },
      }),
    ).toBe(false);
  },
);
