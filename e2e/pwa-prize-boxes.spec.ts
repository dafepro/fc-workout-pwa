import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
});

test("a player claims a sealed daily box and opens it on the consolidated page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/");
  await page.getByRole("link", { name: /Prize boxes/i }).click();
  await expect(page).toHaveURL(/\/prizes$/);

  await page.getByRole("button", { name: "Claim sealed box" }).click();
  await expect(
    page.getByRole("heading", { name: "1 box ready" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Open box" }).click();
  const reveal = page.getByRole("dialog");
  await expect(reveal).toBeVisible();
  await expect(
    reveal.getByRole("link", { name: /Use in (Avatar|Team Lounge)/ }),
  ).toBeVisible();
  await reveal.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your first opened prize will appear here."),
  ).toHaveCount(0);
});
