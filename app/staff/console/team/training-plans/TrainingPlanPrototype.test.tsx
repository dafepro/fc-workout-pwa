import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingPlan, TrainingPlanTemplate } from "./model";
import { TrainingPlanPrototype } from "./TrainingPlanPrototype";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const templates: TrainingPlanTemplate[] = [
  planTemplate("in-season-balance-v1", "In-season balance"),
  planTemplate("speed-recovery-v1", "Speed and recovery"),
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrainingPlanPrototype", () => {
  it("loads the server-owned catalog and previews its seven-day schedule", async () => {
    stubPlanBackend();
    render(<TrainingPlanPrototype teamId="team-one" />);

    const region = await screen.findByRole("region", {
      name: "Training plan builder",
    });
    expect(region).toHaveTextContent("Whole team");
    const schedule = screen.getByRole("list", { name: "Plan schedule" });
    expect(within(schedule).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Publish plan" })).toBeDisabled();
    expect(screen.getByText(/Missed days stay missed/i)).toBeInTheDocument();
  });

  it("publishes the selected dated snapshot and shows it in plan history", async () => {
    const calls = stubPlanBackend();
    render(<TrainingPlanPrototype teamId="team-one" />);

    fireEvent.click(
      await screen.findByRole("radio", { name: /Speed and recovery/i }),
    );
    fireEvent.change(screen.getByLabelText("Plan starts"), {
      target: { value: "2026-08-24" },
    });
    expect(screen.getByText("Mon, Aug 24")).toBeInTheDocument();
    expect(screen.getByText("Sun, Aug 30")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish plan" }));

    await waitFor(() =>
      expect(calls.some((call) => call.method === "POST")).toBe(true),
    );
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      templateId: "speed-recovery-v1",
      startsOn: "2026-08-24",
    });
    expect(await screen.findByText("Published plans")).toBeInTheDocument();
    expect(screen.getByText("Aug 24 – Aug 30")).toBeInTheDocument();
  });
});

interface PlanCall {
  method: string;
  body?: Record<string, unknown>;
}

function stubPlanBackend(): PlanCall[] {
  const calls: PlanCall[] = [];
  let plans: TrainingPlan[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      calls.push({ method, body });
      if (url.endsWith("/training-plan-templates")) {
        return Response.json({ templates });
      }
      if (url.endsWith("/training-plans") && method === "POST") {
        const template = templates.find(({ id }) => id === body?.templateId)!;
        const published: TrainingPlan = {
          id: "plan-one",
          teamId: "team-one",
          templateId: template.id,
          templateVersion: template.version,
          templateName: template.name,
          templateSummary: template.summary,
          startsOn: String(body?.startsOn),
          endsOn: "2026-08-30",
          status: "published",
          createdAt: "2026-08-20T12:00:00Z",
          days: [],
        };
        plans = [published];
        return Response.json(published, { status: 201 });
      }
      if (url.endsWith("/training-plans")) return Response.json({ plans });
      return Response.json(
        { error: { message: "Not found" } },
        { status: 404 },
      );
    }),
  );
  return calls;
}

function planTemplate(id: string, name: string): TrainingPlanTemplate {
  return {
    id,
    version: 1,
    name,
    summary: `${name} summary`,
    days: Array.from({ length: 7 }, (_, offset) => ({
      offset,
      kind: offset === 3 || offset === 6 ? "rest" : "training",
      focus: offset === 3 || offset === 6 ? "recovery" : "endurance",
      durationMinutes: offset === 3 || offset === 6 ? 0 : 18,
      intensity: "easy",
      blocks:
        offset === 3 || offset === 6
          ? (null as unknown as TrainingPlanTemplate["days"][number]["blocks"])
          : [
              {
                activityDefinitionId: "timed-run-walk",
                label: "Timed run or walk",
                durationMinutes: 18,
              },
            ],
    })),
  };
}
