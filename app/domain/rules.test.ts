import { describe, expect, it } from "vitest";
import { activities } from "../data/mockData";
import {
  canDeleteEntry,
  createDeleteDeadline,
  getActivityInput,
  isBackdateAllowed,
  toSocialEntry,
} from "./rules";
import type { TrainingEntry } from "./types";

const now = new Date("2026-08-05T18:00:00.000Z");

function entry(overrides: Partial<TrainingEntry> = {}): TrainingEntry {
  return {
    id: "entry-1",
    playerId: "mason",
    activityId: "distance-run",
    occurredAt: "2026-08-05T17:00:00.000Z",
    value: 2.25,
    unit: "miles",
    effortLevel: 4,
    exhaustionLevel: 5,
    createdAt: now.toISOString(),
    deleteEligibleUntil: createDeleteDeadline(now),
    ...overrides,
  };
}

describe("activity-specific input model", () => {
  it("models every launch activity with its own structured input", () => {
    expect(getActivityInput(activities, "hill-sprints")?.inputKind).toBe(
      "repetitions",
    );
    expect(getActivityInput(activities, "timed-run-walk")?.inputKind).toBe(
      "duration",
    );
    expect(getActivityInput(activities, "distance-run")?.inputKind).toBe(
      "distance",
    );
    expect(getActivityInput(activities, "recovery-walk-jog")?.inputKind).toBe(
      "duration",
    );
  });
});

describe("seven-day backdating", () => {
  it("accepts today and seven days ago, but rejects eight days ago and future dates", () => {
    expect(isBackdateAllowed("2026-08-05", now)).toBe(true);
    expect(isBackdateAllowed("2026-07-29", now)).toBe(true);
    expect(isBackdateAllowed("2026-07-28", now)).toBe(false);
    expect(isBackdateAllowed("2026-08-06", now)).toBe(false);
  });
});

describe("24-hour deletion", () => {
  it("allows only the owner before the exact deadline", () => {
    const trainingEntry = entry();
    expect(
      canDeleteEntry(
        trainingEntry,
        "mason",
        new Date("2026-08-06T17:59:59.999Z"),
      ),
    ).toBe(true);
    expect(
      canDeleteEntry(
        trainingEntry,
        "ava",
        new Date("2026-08-05T19:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      canDeleteEntry(
        trainingEntry,
        "mason",
        new Date("2026-08-06T18:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("raw-performance visibility", () => {
  it("projects only safe participation data for social surfaces", () => {
    const social = toSocialEntry(entry());
    expect(social).toEqual({
      id: "entry-1",
      playerId: "mason",
      activityId: "distance-run",
      occurredAt: "2026-08-05T17:00:00.000Z",
      effortPoints: 70,
    });
    expect(social).not.toHaveProperty("value");
    expect(social).not.toHaveProperty("unit");
    expect(social).not.toHaveProperty("exhaustionLevel");
  });
});
