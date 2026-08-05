import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test.beforeEach(async () => {
  if (process.env.E2E_SKIP_API_RESET === "true") return;

  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
});

test("a teammate can be cheered from Team with an emoji-only picker", async ({
  page,
}) => {
  await openReadyPage(page, "/team");

  await page.getByRole("button", { name: /Liam J\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Liam" });
  await expect(picker).toBeVisible();

  const fire = picker.getByRole("button", { name: "Send Fire to Liam" });
  await expect(fire).toHaveText("🔥");
  await fire.click();

  await expect(page.getByRole("status")).toContainText("sent to Liam");
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Send some energy" }),
  ).toHaveCount(0);
});

test("the picker is usable for a second teammate after a successful cheer", async ({
  page,
}) => {
  await openReadyPage(page, "/team");

  await page.getByRole("button", { name: /Liam J\./ }).click();
  await page
    .getByRole("dialog", { name: "Cheer for Liam" })
    .getByRole("button", { name: "Send Fire to Liam" })
    .click();
  await expect(page.getByRole("status")).toContainText("sent to Liam");

  await page.getByRole("button", { name: /Noah K\./ }).click();
  const secondPicker = page.getByRole("dialog", { name: "Cheer for Noah" });
  const secondCheer = secondPicker.getByRole("button", {
    name: "Send Clap to Noah",
  });
  await expect(secondPicker).toBeVisible();
  await expect(secondCheer).toBeEnabled();
  await secondCheer.click();

  await expect(page.getByRole("status")).toContainText("sent to Noah");
  await expect(secondPicker).toBeHidden();
});

test("leader cards retain leaderboard context and the current player is not reactable", async ({
  page,
}) => {
  await openReadyPage(page, "/leaders");

  await expect(
    page.getByRole("button", { name: /Cheer for Mason C\./ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await picker.getByRole("button", { name: "Send Clap to Ava" }).click();

  await expect(page.getByRole("status")).toContainText("sent to Ava");
});

test("received contextual reactions appear privately on Me", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/v1/reactions", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-inbound-1",
    },
    data: {
      recipientPlayerId: "player-mason",
      reactionType: "fire",
      context: {
        type: "leaderboard",
        teamId: "team-hill-striders",
        period: "weekly",
        metric: "effort",
      },
    },
  });
  expect(response.status()).toBe(201);
  await api.dispose();

  await openReadyPage(page, "/me");
  await expect(
    page.getByRole("heading", { name: "Cheers for you" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Ava R\. saw you on the Weekly Effort leaderboard/),
  ).toBeVisible();
  await expect(page.getByText("🔥", { exact: true })).toBeVisible();
});
