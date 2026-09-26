import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";

test.beforeEach(async () => {
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
});

test("lost save response retries one accepted entry and returns to its history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyPage(page, "/log");
  await page.getByLabel("Reps completed").fill("7");
  let lost = false;
  const keys: string[] = [];
  let acceptedID = "";
  await page.route("**/api/zoomigo/v1/me/training-entries", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (lost) return route.continue();
    lost = true;
    const accepted = await route.fetch();
    expect(accepted.status()).toBe(201);
    acceptedID = (await accepted.json()).id;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("alert")).toContainText("couldn’t confirm");
  await expect(page.getByRole("alert")).toBeInViewport();
  await page.getByRole("link", { name: "Me", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.goBack();
  await expect(page.getByLabel("Reps completed")).toHaveValue("7");
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(
    page.getByRole("link", { name: /View saved session/ }),
  ).toHaveAttribute("href", `/sessions/${acceptedID}`);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  await page.getByRole("link", { name: /View saved session/ }).click();
  await page.getByRole("link", { name: "← My Sessions", exact: true }).click();
  await expect(page).toHaveURL(/\/me#sessions$/);
});

test("cleared input stays empty and a draft survives a navigation detour", async ({
  page,
}) => {
  await openReadyPage(page, "/log");
  await page.getByLabel("Reps completed").fill("");
  await page.locator("h1").click();
  await expect(page.getByLabel("Reps completed")).toBeEmpty();
  await page.getByRole("link", { name: "Me", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.goBack();
  await expect(page.getByLabel("Reps completed")).toBeEmpty();
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByLabel("Reps completed")).not.toBeEmpty();
});

test("unavailable history and session data never claims absence", async ({
  page,
}) => {
  await openReadyPage(page, "/me");
  await page.route("**/api/zoomigo/v1/me/training-entries", (route) =>
    route.abort("failed"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("haven’t been removed");
  await expect(page.getByText("No sessions saved yet.")).toHaveCount(0);
  await expect(page.getByText("0 private saved sessions")).toHaveCount(0);
  await page.unroute("**/api/zoomigo/v1/me/training-entries");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".history-row").first()).toBeVisible();
  await page.route("**/api/zoomigo/v1/training-entries/*", (route) =>
    route.abort("failed"),
  );
  await page.locator(".history-row").first().click();
  await expect(
    page.getByRole("heading", { name: "Session unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Session not found" }),
  ).toHaveCount(0);
  await page.unroute("**/api/zoomigo/v1/training-entries/*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Session unavailable" }),
  ).toHaveCount(0);
});
