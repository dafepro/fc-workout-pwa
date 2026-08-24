import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamCanvasProvider, useTeamCanvas } from "./state";

vi.mock("../state/auth-context", () => ({
  useOptionalAuth: () => ({
    connected: true,
    currentPlayerID: "player-new",
    currentTeamID: "team-new",
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("connected Team Canvas training", () => {
  it("saves the displayed Hill Sprints plan without a current assignment", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    let canvasLoads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("/training-dashboard")) {
          return Response.json({
            team: { id: "team-new", name: "New Team", weeklyGoal: 3 },
            activities: [
              {
                id: "hill-sprints",
                name: "Hill Sprints",
                inputKind: "repetitions",
                unit: "reps",
                minimumValue: 1,
                maximumValue: 20,
                stepValue: 1,
                defaultValue: 8,
              },
            ],
            currentAssignment: null,
            summary: {},
            teamPulse: {
              activeThisWeek: 0,
              unlocked: false,
              recentActivities: [],
            },
            streakComparison: {},
          });
        }
        if (url.endsWith("/v1/me/training-entries")) {
          const body = JSON.parse(String(init?.body)) as {
            activityDefinitionId: string;
            assignmentId?: string;
            occurredAt: string;
            result: { kind: string; value: number; unit: string };
            effortLevel: number;
            exhaustionLevel: number;
          };
          return Response.json(
            {
              id: "entry-new",
              playerId: "player-new",
              teamId: "team-new",
              activityDefinitionId: body.activityDefinitionId,
              assignmentId: body.assignmentId ?? null,
              occurredAt: body.occurredAt,
              result: body.result,
              effortLevel: body.effortLevel,
              exhaustionLevel: body.exhaustionLevel,
              createdAt: body.occurredAt,
              deleteEligibleUntil: body.occurredAt,
            },
            { status: 201 },
          );
        }
        if (url.endsWith("/canvas")) {
          canvasLoads += 1;
          if (canvasLoads >= 3) {
            return Response.json(readyCanvasProjection());
          }
          return Response.json(
            {
              error: {
                code: "team_canvas_locked",
                message: "Finish today first.",
              },
            },
            { status: 423 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <TeamCanvasProvider>
        <CompleteTraining />
      </TeamCanvasProvider>,
    );

    await waitFor(() => expect(screen.getByText("locked")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Complete plan" }));

    await waitFor(() => expect(screen.getByText("saved")).toBeVisible());
    await waitFor(() => expect(screen.getByText("ready")).toBeVisible());
    expect(canvasLoads).toBe(3);
    const create = requests.find(
      ({ url, init }) =>
        url.endsWith("/v1/me/training-entries") && init?.method === "POST",
    );
    expect(create).toBeDefined();
    expect(JSON.parse(String(create?.init?.body))).toMatchObject({
      activityDefinitionId: "hill-sprints",
      result: { kind: "repetitions", value: 8, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
    });
    expect(JSON.parse(String(create?.init?.body))).not.toHaveProperty(
      "assignmentId",
    );
  });

  it("keeps a safe API rejection available to the player UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/training-dashboard")) {
          return Response.json({
            team: { id: "team-new", name: "New Team", weeklyGoal: 3 },
            activities: [
              {
                id: "hill-sprints",
                name: "Hill Sprints",
                inputKind: "repetitions",
                unit: "reps",
                minimumValue: 1,
                maximumValue: 20,
                stepValue: 1,
                defaultValue: 8,
              },
            ],
            currentAssignment: {
              id: "assignment-ended",
              activityDefinitionId: "hill-sprints",
              targetValue: 8,
            },
            summary: {},
            teamPulse: {
              activeThisWeek: 0,
              unlocked: false,
              recentActivities: [],
            },
            streakComparison: {},
          });
        }
        if (
          url.endsWith("/v1/me/training-entries") &&
          init?.method === "POST"
        ) {
          return Response.json(
            {
              error: {
                code: "entry_assignment_unavailable",
                message: "That assignment is unavailable.",
              },
            },
            { status: 422 },
          );
        }
        if (url.endsWith("/canvas")) {
          return Response.json(
            {
              error: {
                code: "team_canvas_locked",
                message: "Finish today first.",
              },
            },
            { status: 423 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <TeamCanvasProvider>
        <CompleteTraining />
      </TeamCanvasProvider>,
    );

    await waitFor(() => expect(screen.getByText("locked")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Complete plan" }));

    await waitFor(() => expect(screen.getByText("failed")).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That assignment is unavailable.",
    );
  });
});

function readyCanvasProjection() {
  return {
    team: { id: "team-new", name: "New Team", weeklyGoal: 3 },
    dayKey: "2026-08-23",
    weekKey: "2026-08-17",
    physics: { v: 1, sceneId: "top-down", sequence: 0 },
    settings: {
      backgroundAssetId: "grass-gradient",
      backgroundColor: "#A8DC9D",
      textColor: "#115630",
      textSize: 112,
      textStyle: "block",
      stampChoices: ["bolt", "star", "rocket", "fire", "soccer"],
      developerStampLimit: 0,
      revision: 1,
    },
    stampChoices: ["bolt", "star", "rocket", "fire", "soccer"],
    members: [],
    pieces: [],
    avatarPosition: { x: 50, y: 50 },
    availableRewards: 1,
    cooldownComplete: false,
    developerControlsEnabled: true,
  };
}

function CompleteTraining() {
  const canvas = useTeamCanvas();
  const [result, setResult] = useState("idle");
  return (
    <>
      <span>{canvas.connectedStatus}</span>
      <button
        type="button"
        onClick={() =>
          void canvas
            .complete({ completion: "goal", effort: 4, tiredness: 3 })
            .then((saved) => setResult(saved ? "saved" : "failed"))
        }
      >
        Complete plan
      </button>
      <span>{result}</span>
      {canvas.connectedError ? (
        <span role="alert">{canvas.connectedError}</span>
      ) : null}
    </>
  );
}
