import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingPlan, TrainingPlanTemplate } from "./model";
import { TrainingPlanBuilder } from "./TrainingPlanBuilder";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const templates = [
  planTemplate("in-season-balance-v1", "In-season balance"),
  planTemplate("speed-recovery-v1", "Speed and recovery"),
];

afterEach(() => vi.unstubAllGlobals());

describe("TrainingPlanBuilder", () => {
  it("previews and publishes a selected seven-day plan", async () => {
    const calls = stubPlanBackend();
    render(<TrainingPlanBuilder teamId="team-one" />);

    const region = await screen.findByRole("region", {
      name: "Training plan builder",
    });
    expect(region).toHaveTextContent("Whole team");
    expect(region).toHaveTextContent(
      "5–20 minutes per active day · up to 5 active days · up to 2 hard days · at least 1 full rest day",
    );
    expect(
      within(screen.getByRole("list", { name: "Plan schedule" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(7);

    fireEvent.click(screen.getByRole("radio", { name: /Speed and recovery/i }));
    fireEvent.change(screen.getByLabelText("Plan starts"), {
      target: { value: "2026-08-24" },
    });
    expect(screen.getByText("Mon, Aug 24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish plan" }));

    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    expect(calls.find(({ method }) => method === "POST")?.body).toMatchObject({
      templateId: "speed-recovery-v1",
      startsOn: "2026-08-24",
      days: expect.arrayContaining([
        expect.objectContaining({ offset: 0, durationMinutes: 15 }),
      ]),
    });
  });

  it("reschedules a future plan as an immutable replacement", async () => {
    const calls = stubPlanBackend([publishedPlan("plan-future", "2099-08-24")]);
    render(<TrainingPlanBuilder teamId="team-one" />);

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(screen.getByLabelText("Plan starts"), {
      target: { value: "2099-08-25" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish replacement" }),
    );

    await waitFor(() =>
      expect(
        calls.some(({ url }) => url.endsWith("/plan-future/reschedule")),
      ).toBe(true),
    );
  });

  it("requires confirmation before cancelling", async () => {
    const calls = stubPlanBackend([publishedPlan("plan-future", "2099-08-24")]);
    render(<TrainingPlanBuilder teamId="team-one" />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
    expect(
      screen.getByText(/completed days, and missed days stay in history/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel plan" }));

    await waitFor(() =>
      expect(calls.some(({ url }) => url.endsWith("/plan-future/cancel"))).toBe(
        true,
      ),
    );
  });
});

interface PlanCall {
  url: string;
  method: string;
  body?: Record<string, unknown>;
}

function stubPlanBackend(initialPlans: TrainingPlan[] = []): PlanCall[] {
  const calls: PlanCall[] = [];
  let plans = [...initialPlans];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/training-plan-templates")) {
        return Response.json({ templates });
      }
      if (url.endsWith("/training-plans") && method === "POST") {
        const template = templates.find(({ id }) => id === body?.templateId)!;
        plans = [
          publishedPlan("plan-one", String(body?.startsOn), template),
          ...plans,
        ];
        return Response.json(plans[0], { status: 201 });
      }
      if (url.endsWith("/reschedule") && method === "POST") {
        const oldID = url.split("/").at(-2)!;
        plans = plans.map((plan) =>
          plan.id === oldID ? { ...plan, status: "cancelled" } : plan,
        );
        return Response.json(
          publishedPlan("plan-replacement", String(body?.startsOn)),
          {
            status: 201,
          },
        );
      }
      if (url.endsWith("/cancel") && method === "POST") {
        const planID = url.split("/").at(-2)!;
        plans = plans.map((plan) =>
          plan.id === planID ? { ...plan, status: "cancelled" } : plan,
        );
        return Response.json(plans.find(({ id }) => id === planID));
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
      durationMinutes: offset === 3 || offset === 6 ? 0 : 15,
      intensity: "easy",
      blocks:
        offset === 3 || offset === 6
          ? []
          : [
              {
                activityDefinitionId: "timed-run-walk",
                label: "Timed run or walk",
                durationMinutes: 15,
              },
            ],
    })),
  };
}

function publishedPlan(
  id: string,
  startsOn: string,
  template = templates[0],
): TrainingPlan {
  return {
    id,
    teamId: "team-one",
    templateId: template.id,
    templateVersion: 1,
    templateName: template.name,
    templateSummary: template.summary,
    startsOn,
    endsOn: startsOn,
    status: "published",
    createdAt: "2026-08-20T12:00:00Z",
    days: template.days.map((day, index) => ({
      ...day,
      index,
      occursOn: startsOn,
    })),
  };
}
