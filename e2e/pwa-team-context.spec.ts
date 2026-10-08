import { expect, request, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

const apiURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test("team preference survives renaming and switches only to current memberships", async ({
  page,
}) => {
  const api = await request.newContext({
    baseURL: apiURL,
    extraHTTPHeaders: { Authorization: "Bearer e2e-admin-zoomigo" },
  });
  try {
    expect(
      (
        await api.post("/__e2e/reset", {
          headers: { "X-E2E-Reset-Key": resetKey },
        })
      ).status(),
    ).toBe(204);
    const input = {
      clubId: "club-zoomigo",
      name: "Other team",
      seasonId: "season-2026",
      timeZone: "Pacific/Kiritimati",
      weeklyGoal: 3,
    };
    const created = await api.post("/v1/staff/teams", { data: input });
    expect(created.status()).toBe(201);
    const second = (await created.json()) as { id: string };
    expect(
      (
        await api.post(`/v1/staff/teams/${second.id}/roster`, {
          data: { playerId: "player-mason" },
        })
      ).status(),
    ).toBe(204);
    await loginAsMason(page);
    const session = (await (
      await page.request.get("/api/auth/session")
    ).json()) as {
      activeTeamId: string;
      player: { teams: { id: string; name: string; timeZone: string }[] };
    };
    const stableDefault = [...session.player.teams].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )[0];
    expect(session.activeTeamId).toBe(stableDefault.id);
    const target = session.player.teams.find((t) => t.id !== stableDefault.id)!;
    await page.goto("/me");
    await page.locator(".account-details > summary").click();
    await expect(
      page.getByRole("combobox", { name: "Current team" }),
    ).toHaveValue(stableDefault.id);
    const claimBefore = await page.request.post(
      "/api/zoomigo/v1/me/prize-boxes/claim-daily",
      { headers: { "Idempotency-Key": "team-context-daily-before" } },
    );
    expect(claimBefore.status()).toBe(201);
    const firstBox = (await claimBefore.json()).box;
    const initialPrize = await (
      await page.request.get("/api/zoomigo/v1/me/prize-boxes")
    ).json();
    const selectedInput = {
      ...input,
      name: "Z renamed team",
      timeZone: stableDefault.timeZone,
    };
    expect(
      (
        await api.put(`/v1/staff/teams/${stableDefault.id}`, {
          data: selectedInput,
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.locator(".account-details > summary").click();
    await expect(
      page.getByRole("combobox", { name: "Current team" }),
    ).toHaveValue(stableDefault.id);
    await page.goto("/log");
    await page.getByLabel("Reps completed").fill("9");
    await page.getByRole("link", { name: "Me", exact: true }).click();
    await page.locator(".account-details > summary").click();
    await page
      .getByRole("combobox", { name: "Current team" })
      .selectOption(target.id);
    await expect(
      page.getByRole("button", { name: "Switch team", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Save or discard your drafts before switching teams."),
    ).toBeVisible();
    await page.reload();
    await page.locator(".account-details > summary").click();
    await page
      .getByRole("combobox", { name: "Current team" })
      .selectOption(target.id);
    await expect(
      page.getByRole("button", { name: "Switch team", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Discard saved drafts", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Yes, discard drafts", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Switch team", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Switch team", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator("html[data-app-ready='true']").waitFor();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("zoomigo-team-context:v1"),
      ),
    ).toBe(`player-mason/${target.id}`);
    const contextHeaders = {
      "X-Zoomigo-Team-Context": `player-mason/${target.id}`,
    };
    const selectedSession = await (
      await page.request.get("/api/auth/session", { headers: contextHeaders })
    ).json();
    expect(selectedSession.activeTeamId).toBe(target.id);
    const dashboard = await page.request.get(
      `/api/zoomigo/v1/me/training-dashboard?teamId=${target.id}`,
    );
    expect(dashboard.status()).toBe(200);
    expect((await dashboard.json()).team.id).toBe(target.id);
    const nextPrize = await (
      await page.request.get("/api/zoomigo/v1/me/prize-boxes")
    ).json();
    expect(nextPrize.day).toBe(initialPrize.day);
    expect(nextPrize.earnedTotal).toBe(initialPrize.earnedTotal);
    const claimAfter = await page.request.post(
      "/api/zoomigo/v1/me/prize-boxes/claim-daily",
      { headers: { "Idempotency-Key": "team-context-daily-after" } },
    );
    expect(claimAfter.status()).toBe(200);
    expect((await claimAfter.json()).box.id).toBe(firstBox.id);
    const otherTab = await page.context().newPage();
    try {
      await otherTab.goto("/me");
      await otherTab.locator(".account-details > summary").click();
      await expect(
        otherTab.getByRole("combobox", { name: "Current team" }),
      ).toHaveValue(stableDefault.id);
      await page.goto("/me");
      await page.locator(".account-details > summary").click();
      await expect(
        page.getByRole("combobox", { name: "Current team" }),
      ).toHaveValue(target.id);
      await otherTab.reload();
      await otherTab.locator(".account-details > summary").click();
      await expect(
        otherTab.getByRole("combobox", { name: "Current team" }),
      ).toHaveValue(stableDefault.id);
      const forged = await (
        await page.request.get("/api/auth/session", {
          headers: { "X-Zoomigo-Team-Context": `player-ava/${target.id}` },
        })
      ).json();
      expect(forged.activeTeamId).toBe(stableDefault.id);
    } finally {
      await otherTab.close();
    }

    expect(
      (
        await page.request.post("/api/auth/team", {
          data: { teamId: "not-a-membership" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/auth/team", {
          headers: { Origin: "https://untrusted.example" },
          data: { teamId: stableDefault.id },
        })
      ).status(),
    ).toBe(403);
    const malformed = await page.request.post("/api/auth/team", {
      data: { teamId: stableDefault.id, extra: "unapproved" },
    });
    expect(malformed.status(), await malformed.text()).toBe(400);
    expect(
      (
        await api.delete(`/v1/staff/teams/${target.id}/roster/player-mason`)
      ).status(),
    ).toBe(204);
    // End dates are inclusive; the active team is still available for this local day.
    expect(
      (
        await page.request.get(
          `/api/zoomigo/v1/me/training-dashboard?teamId=${target.id}`,
        )
      ).status(),
    ).toBe(200);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/me");
    await page.locator(".account-details > summary").click();
    await expect(
      page.getByRole("combobox", { name: "Current team" }),
    ).toHaveValue(target.id);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
  } finally {
    await api.dispose();
  }
});
