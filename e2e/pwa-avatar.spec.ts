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

test("a player's chosen look survives a reload and reaches the nav", async ({
  page,
}) => {
  await openReadyPage(page, "/me");
  await page.getByRole("button", { name: "Avatar builder" }).click();

  await page.getByRole("radio", { name: "Zoomi the cheetah" }).check();
  await page.getByRole("radio", { name: "Aviators" }).check();
  await page.getByRole("radio", { name: "Deep ocean" }).check();
  await page.getByRole("button", { name: "Save my look" }).click();

  await expect(page.getByText("Look saved!")).toBeVisible();

  // The profile hero and the nav both read the same auth state, so the stub's
  // failure to propagate would show up here.
  const heroArt = page.locator(".profile-hero .avatar-art");
  const navArt = page.locator(".nav-user-avatar .avatar-art").first();
  await expect(heroArt).toBeVisible();
  await expect(navArt).toBeVisible();

  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();

  await expect(page.locator(".profile-hero .avatar-art")).toBeVisible();
  await page.getByRole("button", { name: "Avatar builder" }).click();
  await expect(
    page.getByRole("radio", { name: "Zoomi the cheetah" }),
  ).toBeChecked();
  await expect(page.getByRole("radio", { name: "Aviators" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Deep ocean" })).toBeChecked();
});

test("the builder offers no free text or upload control", async ({ page }) => {
  await openReadyPage(page, "/me");
  await page.getByRole("button", { name: "Avatar builder" }).click();

  const builder = page.locator(".avatar-builder");
  await expect(builder.locator("input[type='text']")).toHaveCount(0);
  await expect(builder.locator("input[type='file']")).toHaveCount(0);
  await expect(builder.locator("textarea")).toHaveCount(0);
});
