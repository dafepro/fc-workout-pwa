import { copy } from "../content/copy";

type ParticipationDay = {
  kind: string;
  completed: boolean;
  planId: string;
  dayIndex: number;
  blocks: {
    blockIndex: number;
    completed: boolean;
    activityDefinitionId: string;
  }[];
};
export type ParticipationAction = {
  href: string;
  label: string;
  detail: string;
};

export function planLogHref(
  day: Pick<ParticipationDay, "planId" | "dayIndex">,
  blockIndex: number,
  activityID: string,
) {
  return `/log?${new URLSearchParams({ planId: day.planId, dayIndex: String(day.dayIndex), blockIndex: String(blockIndex), activityId: activityID })}`;
}

export function participationAction(
  day: ParticipationDay | null,
): ParticipationAction {
  if (day?.kind === "rest" && !day.completed)
    return {
      href: "/",
      label: copy.participation.rest,
      detail: copy.participation.restDetail,
    };
  const block = day?.blocks.find((item) => !item.completed);
  if (day && block && !day.completed)
    return {
      href: planLogHref(day, block.blockIndex, block.activityDefinitionId),
      label: copy.participation.workout,
      detail: copy.participation.workoutDetail,
    };
  return {
    href: "/log",
    label: copy.participation.workout,
    detail: copy.participation.workoutDetail,
  };
}
