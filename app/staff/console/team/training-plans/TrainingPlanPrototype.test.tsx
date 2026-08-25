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

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn() };
  return { useRouter: () => router };
});

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
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      templateId: "speed-recovery-v1",
      startsOn: "2026-08-24",
      days: expect.arrayContaining([
        expect.objectContaining({ offset: 0, durationMinutes: 15 }),
      ]),
    });
    expect(await screen.findByText("Published plans")).toBeInTheDocument();
    expect(screen.getByText("Aug 24 – Aug 30")).toBeInTheDocument();
  });

  it("customizes predefined fields and reschedules a future plan as a replacement", async () => {
    const futurePlan = publishedPlan("plan-future", "2099-08-24");
    const calls = stubPlanBackend([futurePlan]);
    render(<TrainingPlanPrototype teamId="team-one" />);

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(screen.getByLabelText("Plan starts"), {
      target: { value: "2099-08-25" },
    });
    fireEvent.click(screen.getAllByText("Customize future days")[0]);
    fireEvent.change(screen.getByLabelText("Tue, Aug 25 Minutes"), {
      target: { value: "15" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish replacement" }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.url.endsWith("/plan-future/reschedule")),
      ).toBe(true),
    );
    expect(
      calls.find((call) => call.url.endsWith("/plan-future/reschedule"))?.body,
    ).toMatchObject({ startsOn: "2099-08-25" });
  });

  it("requires confirmation before cancelling while retaining the history row", async () => {
    const calls = stubPlanBackend([publishedPlan("plan-future", "2099-08-24")]);
    render(<TrainingPlanPrototype teamId="team-one" />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
    expect(
      screen.getByText(/completed days, and missed days stay in history/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel plan" }));

    await waitFor(() =>
      expect(
        calls.some((call) => call.url.endsWith("/plan-future/cancel")),
      ).toBe(true),
    );
  });

  it("refreshes obsolete controls when another coach already changed the plan", async () => {
    const calls = stubPlanBackend(
      [publishedPlan("plan-future", "2099-08-24")],
      {
        staleAction: "cancel",
      },
    );
    render(<TrainingPlanPrototype teamId="team-one" />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /changed in another session/i,
    );
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, url }) =>
            method === "GET" && url.endsWith("/training-plans"),
        ),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull(),
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

interface PlanCall {
  url: string;
  method: string;
  body?: Record<string, unknown>;
}

function stubPlanBackend(
  initialPlans: TrainingPlan[] = [],
  options: { staleAction?: "cancel" | "reschedule" } = {},
): PlanCall[] {
  const calls: PlanCall[] = [];
  let plans: TrainingPlan[] = [...initialPlans];
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
      if (url.endsWith("/reschedule") && method === "POST") {
        const oldID = url.split("/").at(-2)!;
        if (options.staleAction === "reschedule") {
          plans = plans.map((plan) =>
            plan.id === oldID ? { ...plan, status: "cancelled" } : plan,
          );
          return Response.json(
            {
              error: {
                code: "training_plan_changed",
                message:
                  "That plan changed in another session. The latest plan history is shown.",
              },
            },
            { status: 409 },
          );
        }
        plans = plans.map((plan) =>
          plan.id === oldID ? { ...plan, status: "cancelled" } : plan,
        );
        const replacement = {
          ...publishedPlan("plan-replacement", String(body?.startsOn)),
          replacesPlanId: oldID,
        };
        plans = [replacement, ...plans];
        return Response.json(replacement, { status: 201 });
      }
      if (url.endsWith("/cancel") && method === "POST") {
        const planID = url.split("/").at(-2)!;
        plans = plans.map((plan) =>
          plan.id === planID ? { ...plan, status: "cancelled" } : plan,
        );
        if (options.staleAction === "cancel") {
          return Response.json(
            {
              error: {
                code: "training_plan_changed",
                message:
                  "That plan changed in another session. The latest plan history is shown.",
              },
            },
            { status: 409 },
          );
        }
        return Response.json(plans.find((plan) => plan.id === planID));
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
          ? (null as unknown as TrainingPlanTemplate["days"][number]["blocks"])
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

function publishedPlan(id: string, startsOn: string): TrainingPlan {
  const template = templates[0];
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
