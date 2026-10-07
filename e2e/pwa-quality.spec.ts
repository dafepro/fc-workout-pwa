import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";
import { mkdir } from "node:fs/promises";

test.use({ serviceWorkers: "block", timezoneId: "America/Chicago" });

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

test("core screens remain usable at narrow, phone and desktop widths", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openReadyPage(page, "/");
  await mkdir("outputs/ux-review/after", { recursive: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/log",
      "/team",
      "/me",
      "/progress",
      "/prizes",
      "/me/avatar",
    ]) {
      await page.goto(path);
      await expect(page.locator("html[data-app-ready='true']")).toBeVisible();
      await expect(page.locator("h1").first()).toBeVisible();
      if (path === "/prizes")
        await expect(
          page.getByRole("heading", { name: "Your collection" }),
        ).toBeVisible();
      if (path === "/me/avatar")
        await expect(page.getByRole("radio").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `outputs/ux-review/after/${path.replaceAll("/", "-") || "today"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/log");
  const trigger = page.getByRole("button", { name: /^Selected workout:/ });
  await trigger.click();
  const choice = page.getByRole("radio").first();
  await choice.focus();
  await choice.press("Space");
  await expect(trigger).toBeFocused();
  expect(
    await page.getByRole("button", { name: /^Save/ }).evaluate((button) => {
      const date = document.querySelector(".when-details");
      return (
        !!date &&
        !!(
          date.compareDocumentPosition(button) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      );
    }),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("lost save response retries one accepted entry and returns to its history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyPage(page, "/log");
  const boundary = await page.evaluate(() => {
    const before = new Date();
    before.setHours(23, 59, 0, 0);
    const after = new Date(before);
    after.setDate(after.getDate() + 1);
    after.setHours(0, 1, 0, 0);
    const original = new Date(before);
    original.setDate(original.getDate() - 7);
    return {
      before: before.toISOString(),
      after: after.toISOString(),
      date: original.toLocaleDateString("en-CA"),
    };
  });
  await page.clock.setFixedTime(new Date(boundary.before));
  await page.locator(".when-details > summary").click();
  await page.getByLabel("Date", { exact: true }).fill(boundary.date);
  await page.getByLabel("Time", { exact: true }).fill("12:00");
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
  await page.clock.setFixedTime(new Date(boundary.after));
  await expect(page.getByLabel("Reps completed")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Discard draft" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Me", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.goBack();
  await expect(page.getByLabel("Reps completed")).toHaveValue("7");
  await page.reload();
  await expect(page.getByLabel("Reps completed")).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /View saved session/ }),
  ).toHaveAttribute("href", `/sessions/${acceptedID}`);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  const entries = await page.request.get("/api/zoomigo/v1/me/training-entries");
  expect(
    (await entries.json()).items.filter(
      (entry: { id: string }) => entry.id === acceptedID,
    ),
  ).toHaveLength(1);
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

test("a definitive first rejection allows correction with a new submission", async ({
  page,
}) => {
  await openReadyPage(page, "/log");
  const keys: string[] = [];
  await page.route("**/api/zoomigo/v1/me/training-entries", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length > 1) return route.continue();
    const body = route.request().postDataJSON();
    const rejected = await route.fetch({
      postData: JSON.stringify({
        ...body,
        result: { ...body.result, value: 99999 },
      }),
    });
    expect(rejected.status()).toBe(422);
    await route.fulfill({ response: rejected });
  });
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Reps completed")).toBeEnabled();
  await page.getByLabel("Reps completed").fill("8");
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /View saved session/ }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).not.toBe(keys[0]);
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
