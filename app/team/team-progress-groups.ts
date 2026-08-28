import type { TeamGoalStatus } from "../domain/types";

export interface TeamProgressGroupDefinition {
  status: TeamGoalStatus;
  title: string;
  rule: string;
  tone: "lime" | "gold" | "blue";
}

export function teamProgressGroups(
  weeklyGoal: number,
): TeamProgressGroupDefinition[] {
  const oneAway = Math.max(weeklyGoal - 1, 0);
  return [
    {
      status: "completed",
      title: `Reached the ${weeklyGoal}-session goal`,
      rule: `${weeklyGoal} or more sessions this week`,
      tone: "lime",
    },
    {
      status: "one_away",
      title: "One session away",
      rule: `Exactly ${sessionCount(oneAway)} this week`,
      tone: "gold",
    },
    {
      status: "keep_going",
      title: "Working towards it",
      rule: `Fewer than ${sessionCount(oneAway)} this week`,
      tone: "blue",
    },
  ];
}

function sessionCount(count: number): string {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}
