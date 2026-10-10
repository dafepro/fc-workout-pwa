import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";
import { FIXTURE_TEAM_ID, signInAsCoach } from "./staff-sign-in";

test("a coach publishes the next reward after the team earns its first", async ({
  page,
}) => {
  const api = await request.newContext({
    baseURL: process.env.E2E_API_BASE_URL ?? "http://api:8080",
  });
  try {
    expect(
      (
        await api.post("/__e2e/reset", {
          headers: {
            "X-E2E-Reset-Key":
              process.env.E2E_RESET_KEY ?? "local-e2e-reset-only",
          },
        })
      ).status(),
    ).toBe(204);
    await page.setViewportSize({ width: 320, height: 720 });
    await signInAsCoach(page);
    const teamPath = `/staff/api/backend/v1/staff/teams/${FIXTURE_TEAM_ID}`;
    await page.goto(`/staff/teams/${FIXTURE_TEAM_ID}/rewards`);
    const start = page.getByLabel("Starts on");
    await expect(start).not.toHaveValue("");
    const today = await start.inputValue();
    const planResponse = await page.request.post(`${teamPath}/training-plans`, {
      data: { templateId: "speed-recovery-v1", startsOn: shiftDay(today, -3) },
    });
    expect(planResponse.status()).toBe(201);
    const plan = await planResponse.json();
    await page.getByLabel("Reward name").fill("First team celebration");
    await page.getByLabel("Days to earn").selectOption("1");
    await page.getByLabel("Team participation").selectOption("50");
    const firstResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/team-reward") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Publish reward" }).click();
    const first = await (await firstResponse).json();
    await expect(page.getByText("Reward published.")).toBeVisible();

    for (const player of ["mason", "ava", "liam", "noah", "zoe", "jayden"]) {
      const rest = await api.post("/v1/me/planned-rest-check-ins", {
        headers: {
          Authorization: `Bearer e2e-player-${player}`,
          "Idempotency-Key": randomUUID(),
        },
        data: { teamId: FIXTURE_TEAM_ID, planId: plan.id, dayIndex: 3 },
      });
      expect(rest.status()).toBe(201);
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "First team celebration" }),
    ).toBeVisible();
    await expect(page.getByLabel("Reward name")).toBeVisible();
    await page.getByLabel("Reward name").fill("Next team celebration");
    await page.getByLabel("Starts on").fill(shiftDay(today, 1));
    await page.getByLabel("Ends on").fill(shiftDay(today, 7));
    const nextResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/team-reward") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Publish reward" }).click();
    const next = await nextResponse;
    expect(next.status()).toBe(201);
    const second = await next.json();
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("active");
    await expect(
      page.getByRole("heading", { name: "Next team celebration" }),
    ).toBeVisible();
    await expect(page.getByLabel("Reward name")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel reward" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  } finally {
    await api.dispose();
  }
});

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
