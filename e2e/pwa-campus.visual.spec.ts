import { mkdir } from "node:fs/promises";
import { test, expect, request } from "@playwright/test";
import { loginAsMason } from "./app-ready";

test.skip(
  process.env.E2E_TEAM_WORLD !== "1",
  "Requires the disposable local Team World fixture stack",
);

test("campus art loads in the real gated world at desktop and phone widths", async ({
  page,
}) => {
  const api = await request.newContext({
    baseURL: process.env.E2E_API_BASE_URL ?? "http://api:8080",
  });
  const reset = await api.post("/__e2e/reset", {
    headers: {
      "X-E2E-Reset-Key": process.env.E2E_RESET_KEY ?? "local-e2e-reset-only",
    },
  });
  expect(reset.status()).toBe(204);
  await api.dispose();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsMason(page);
  await page.goto("/log/additional");
  await page
    .getByRole("button", { name: "Choose an activity", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Hill Sprints/i }).click();
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/zoomigo/v1/me/training-entries") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Save / }).click();
  expect((await saved).status()).toBe(201);
  const asset = page.waitForResponse((r) =>
    r.url().endsWith("campus-v1/team-campus.glb"),
  );
  await page.goto("/team-world");
  expect((await asset).status()).toBe(200);
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await mkdir("outputs/campus/evidence", { recursive: true });
  const movement = page.locator("summary").filter({ hasText: /^Move & play$/ });
  await movement.click();
  await page.getByRole("slider").focus();
  await page.getByRole("slider").press("Home");
  await expect(page.getByRole("slider")).toHaveValue("1");
  await movement.click();
  await page.screenshot({
    path: "outputs/campus/evidence/connected-desktop.png",
  });
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  const dock = await page.locator(".team-world-dock").boundingBox();
  expect(dock!.x).toBeGreaterThanOrEqual(0);
  expect(dock!.x + dock!.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "outputs/campus/evidence/connected-phone.png",
  });
  expect(errors).toEqual([]);
});
