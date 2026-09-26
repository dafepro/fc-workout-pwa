import { describe, expect, it } from "vitest";
import { submissionAttempt } from "./submission";
import type { TrainingEntryInput } from "../domain/types";

const entry: TrainingEntryInput = {
  activityId: "hill-sprints",
  inputKind: "repetitions",
  occurredAt: "2026-09-26T14:00:00Z",
  value: 7,
  unit: "reps",
  effortLevel: 4,
  exhaustionLevel: 3,
  completionOutcome: "as_listed",
};

describe("a logical training submission", () => {
  it("retains its key after an uncertain outcome and navigation recovery", () => {
    const first = submissionAttempt(entry);
    const restored = JSON.parse(JSON.stringify(first));
    expect(submissionAttempt({ ...entry }, restored)).toEqual(first);
  });
  it("starts a new attempt for an explicitly changed answer or a new entry", () => {
    const first = submissionAttempt(entry);
    expect(submissionAttempt({ ...entry, value: 8 }, first).key).not.toBe(
      first.key,
    );
    expect(submissionAttempt(entry).key).not.toBe(first.key);
  });
});
