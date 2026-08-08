import type { ActivityDefinition, ActivityId } from "../domain/types";

type ActivityPresentation = Pick<
  ActivityDefinition,
  "shortName" | "icon" | "fieldLabel" | "description" | "instructions"
>;

export const activityPresentation: Record<ActivityId, ActivityPresentation> = {
  "hill-sprints": {
    shortName: "Sprints",
    icon: "↗",
    fieldLabel: "Reps completed",
    description: "8 reps × 6 seconds",
    instructions: [
      "Find a short hill with clear footing and room to slow down safely.",
      "Run uphill fast for 6 seconds. Stop before your form gets sloppy.",
      "Walk slowly back to the start, then wait until your breathing feels calm.",
      "Repeat 8 times. Finish with an easy walk and some water.",
    ],
  },
  "timed-run-walk": {
    shortName: "Timed",
    icon: "⏱",
    fieldLabel: "Elapsed minutes",
    description: "Run or walk for a planned amount of time",
    instructions: [
      "Choose a clear, familiar route with a safe place to finish.",
      "Start your timer when you begin moving.",
      "Run or walk at a pace you can control for the whole session.",
      "Stop the timer when you finish and record the total minutes.",
    ],
  },
  "distance-run": {
    shortName: "Distance",
    icon: "◎",
    fieldLabel: "Distance completed",
    description: "Run or walk a known distance · miles",
    instructions: [
      "Choose a familiar route with a distance you know.",
      "Run or walk at a pace you can control.",
      "Slow down if you need to; finishing safely matters more than speed.",
      "Record the distance you completed in miles.",
    ],
  },
  "recovery-walk-jog": {
    shortName: "Recovery",
    icon: "≈",
    fieldLabel: "Elapsed minutes",
    description: "Easy movement at a comfortable pace",
    instructions: [
      "Choose a clear, familiar route.",
      "Walk or jog easily enough to talk comfortably.",
      "Keep the whole session relaxed; this is not a speed workout.",
      "Finish with water and record the total minutes.",
    ],
  },
};
