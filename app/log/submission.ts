import type { TrainingEntryInput } from "../domain/types";

export type SubmissionAttempt = { key: string; fingerprint: string };

export function submissionAttempt(
  input: TrainingEntryInput,
  previous?: SubmissionAttempt,
): SubmissionAttempt {
  const fingerprint = JSON.stringify(input);
  return previous?.fingerprint === fingerprint
    ? previous
    : { key: crypto.randomUUID(), fingerprint };
}
