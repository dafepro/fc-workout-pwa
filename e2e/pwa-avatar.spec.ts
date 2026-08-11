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

test("a player builds a v3 look with independent Gear sublayers", async ({
  page,
}) => {
  await openReadyPage(page, "/me");

  await expect(page.locator(".profile-hero .avatar-art")).toHaveCount(0);
  await expect(page.locator(".profile-hero .avatar")).toContainText("MC");
  await page.getByRole("link", { name: "Customize avatar" }).click();
  await expect(page).toHaveURL(/\/me\/avatar$/);
  await expect(page.getByRole("link", { name: "Record training" })).toHaveCount(
    0,
  );

  await expect(
    page.getByRole("radio", { name: /Rover the dog.*locked/i }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: "Tall person" }).check();
  await page.getByRole("button", { name: "Kit" }).click();
  await expect(
    page.getByRole("group", { name: "Kits" }).getByRole("radio"),
  ).toHaveCount(8);
  await expect(
    page.locator(".avatar-builder__preview .avatar-art"),
  ).toHaveAttribute("viewBox", "0 0 64 82");
  await expect(page.locator(".avatar-choice .avatar-art")).toHaveCount(0);
  await page.getByRole("radio", { name: "Coral charge kit" }).check();

  await page.getByRole("button", { name: "Gear" }).click();
  await page.getByRole("radio", { name: "Cap" }).check();
  await page.getByRole("radio", { name: "Round glasses" }).check();
  await expect(page.getByRole("radio", { name: "Cap" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Round glasses" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Color" }).click();
  await page.getByLabel("Avatar color").fill("#22aacc");
  await page.getByLabel("Accent color").fill("#112233");
  await page.getByLabel("Solid background").fill("#ffeeaa");
  await page.getByRole("button", { name: "FX" }).click();
  await page.getByRole("radio", { name: "Orbit effect" }).check();
  await expect(page.locator(".avatar-effect--animated")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("link", { name: "Back to profile" }).click();
  await expect(page.locator(".profile-hero .avatar-art")).toBeVisible();

  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.getByRole("link", { name: "Customize avatar" }).click();
  await page.getByRole("button", { name: "Gear" }).click();
  await expect(page.getByRole("radio", { name: "Cap" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Round glasses" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "FX" }).click();
  await expect(page.getByRole("radio", { name: "Orbit effect" })).toBeChecked();
});

test("the Studio uses compact accessible controls without open text or upload", async ({
  page,
}) => {
  await openReadyPage(page, "/me/avatar");

  const builder = page.locator(".avatar-builder");
  await expect(builder.locator("input[type='text']")).toHaveCount(0);
  await expect(builder.locator("input[type='file']")).toHaveCount(0);
  await expect(builder.locator("textarea")).toHaveCount(0);
  await expect(builder.locator(".avatar-choice__label")).toHaveCount(0);
  await expect(builder.locator(".avatar-builder__tray")).toBeVisible();
});
