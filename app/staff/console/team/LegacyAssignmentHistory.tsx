"use client";

import { ConsoleNotice } from "../ConsoleChrome";
import { consoleCopy } from "../copy";
import type { AssignmentSummary } from "../types";
import { useResource } from "../useResource";

export function LegacyAssignmentHistory({ teamId }: { teamId: string }) {
  const assignments = useResource<{ assignments: AssignmentSummary[] }>(
    `v1/staff/teams/${teamId}/assignments`,
  );
  const copy = consoleCopy.trainingPlans.legacy;

  if (assignments.loading && !assignments.data) {
    return <p>{copy.loading}</p>;
  }
  if (assignments.error && !assignments.data) {
    return <ConsoleNotice message={assignments.error} />;
  }
  if (!assignments.data?.assignments.length) return null;

  return (
    <details className="console-card training-plan__legacy">
      <summary>
        <span>
          <strong>{copy.title}</strong>
          <small>{copy.summary}</small>
        </span>
        <span>{assignments.data.assignments.length}</span>
      </summary>
      <p className="console-hint">{copy.body}</p>
      <ul>
        {assignments.data.assignments.map((assignment) => (
          <li key={assignment.id}>
            <span>
              <strong>{assignment.activityName}</strong>
              <small>
                {assignment.targetValue} {assignment.targetUnit}
              </small>
            </span>
            <small>
              {assignment.startsOn} – {assignment.dueOn}
            </small>
          </li>
        ))}
      </ul>
    </details>
  );
}
