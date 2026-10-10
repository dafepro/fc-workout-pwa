import type { TrainingEntryInput } from "../domain/types";

export type SubmissionAttempt = { key: string; fingerprint: string };

export function submissionInput(
  attempt: SubmissionAttempt,
): TrainingEntryInput | null {
  try {
    if (
      typeof attempt.key !== "string" ||
      !attempt.key.length ||
      attempt.key.length > 128 ||
      typeof attempt.fingerprint !== "string" ||
      attempt.fingerprint.length > 8192
    )
      return null;
    const input = JSON.parse(attempt.fingerprint);
    const id = (value: unknown) =>
      typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
    const feeling = (value: unknown) =>
      Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
    if (
      !input ||
      Array.isArray(input) ||
      !id(input.activityId) ||
      !["repetitions", "duration", "distance"].includes(input.inputKind) ||
      typeof input.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(input.occurredAt)) ||
      !Number.isFinite(input.value) ||
      typeof input.unit !== "string" ||
      !input.unit.length ||
      input.unit.length > 24 ||
      !feeling(input.effortLevel) ||
      !feeling(input.exhaustionLevel) ||
      !["partial", "as_listed", "extra"].includes(
        input.completionOutcome ?? "as_listed",
      ) ||
      (input.assignmentId !== undefined && !id(input.assignmentId))
    )
      return null;
    if (
      input.plan !== undefined &&
      (!input.plan ||
        !id(input.plan.planId) ||
        !Number.isInteger(input.plan.dayIndex) ||
        input.plan.dayIndex < 0 ||
        !Number.isInteger(input.plan.blockIndex) ||
        input.plan.blockIndex < 0)
    )
      return null;
    return input;
  } catch {
    return null;
  }
}

export function submissionAttempt(
  input: TrainingEntryInput,
  previous?: SubmissionAttempt,
): SubmissionAttempt {
  const fingerprint = JSON.stringify(input);
  return previous?.fingerprint === fingerprint
    ? previous
    : { key: crypto.randomUUID(), fingerprint };
}
