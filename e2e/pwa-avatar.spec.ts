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

test("a player builds a v4 look with independent Gear sublayers", async ({
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
  await page.getByRole("button", { name: "Person color" }).click();
  await page.getByRole("button", { name: "Aqua" }).click();
  await expect(
    page.locator(
      '.avatar-builder__preview .avatar-art__layer--head [fill="#22aacc"]',
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Person accent" }).click();
  await page.getByRole("button", { name: "Ink" }).click();
  await page.getByRole("button", { name: "Kit" }).click();
  await expect(
    page.getByRole("group", { name: "Kits" }).getByRole("radio"),
  ).toHaveCount(8);
  await expect(
    page.locator(".avatar-builder__preview .avatar-art"),
  ).toHaveAttribute("viewBox", "0 0 64 82");
  await expect(page.locator(".avatar-choice .avatar-art")).toHaveCount(0);
  await page.getByRole("radio", { name: "Chevron kit" }).check();
  await page.getByRole("button", { name: "Kit color" }).click();
  await page.getByRole("button", { name: "Coral" }).click();

  await page.getByRole("button", { name: "Gear" }).click();
  await page.getByRole("radio", { name: "Cap" }).check();
  await page.getByRole("radio", { name: "Round glasses" }).check();
  await expect(page.getByRole("radio", { name: "Cap" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Round glasses" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Background" }).click();
  await page.getByRole("button", { name: "Background color" }).click();
  await page.getByRole("button", { name: "Gold" }).click();
  await page.getByRole("radio", { name: "Pulse effect" }).check();
  await expect(page.locator(".avatar-effect--pulse")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("status")).toContainText("Avatar saved");
  await expect(page.locator(".profile-hero .avatar-art")).toBeVisible();

  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.getByRole("link", { name: "Customize avatar" }).click();
  await page.getByRole("button", { name: "Gear" }).click();
  await expect(page.getByRole("radio", { name: "Cap" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Round glasses" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Background" }).click();
  await expect(page.getByRole("radio", { name: "Pulse effect" })).toBeChecked();
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
