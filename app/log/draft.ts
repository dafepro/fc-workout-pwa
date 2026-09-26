import type { ActivityId, CompletionOutcome } from "../domain/types";
import type { SubmissionAttempt } from "./submission";

export type TrainingDraft = {
  selection: { activityId: ActivityId; value: number } | null;
  amountText?: string;
  date: string;
  time: string;
  effort: number;
  exhaustion: number;
  completionOutcome: CompletionOutcome;
  attempt?: SubmissionAttempt;
};

export function isTrainingDraft(value: unknown): value is TrainingDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as TrainingDraft;
  return (
    typeof draft.date === "string" &&
    typeof draft.time === "string" &&
    Number.isInteger(draft.effort) &&
    draft.effort >= 1 &&
    draft.effort <= 7 &&
    Number.isInteger(draft.exhaustion) &&
    draft.exhaustion >= 1 &&
    draft.exhaustion <= 7 &&
    ["partial", "as_listed", "extra"].includes(draft.completionOutcome) &&
    (draft.amountText === undefined || typeof draft.amountText === "string") &&
    (draft.selection === null ||
      (typeof draft.selection?.activityId === "string" &&
        Number.isFinite(draft.selection.value))) &&
    (draft.attempt === undefined ||
      (typeof draft.attempt.key === "string" &&
        typeof draft.attempt.fingerprint === "string"))
  );
}
