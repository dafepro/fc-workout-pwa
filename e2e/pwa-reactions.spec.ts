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

test("a teammate can be cheered from Team with labeled, contextual choices", async ({
  page,
}) => {
  await openReadyPage(page, "/team");

  await page.getByRole("button", { name: /Liam J\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Liam" });
  await expect(picker).toBeVisible();
  await expect(picker.getByText("For Team progress")).toBeVisible();

  const fire = picker.getByRole("button", { name: "Send Fire to Liam" });
  await expect(fire.getByText("Fire", { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fire.click();

  await expect(page.getByRole("status")).toContainText("sent to Liam");
  await expect(page.getByRole("status")).not.toContainText(/left|remaining/i);
  await expect
    .poll(() =>
      page
        .getByRole("status")
        .evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe("none");
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Send some energy" }),
  ).toHaveCount(0);
});

test("a completed shared challenge can be cheered without hiding other cheer entry points", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-ava-challenge-completion",
    },
    data: challengeEntry(),
  });
  expect(completion.status()).toBe(201);
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/team");

  const challenge = page.getByRole("region", {
    name: "Hill Sprints",
  });
  await expect(
    challenge.getByText("1 of 12 teammates completed"),
  ).toBeVisible();
  await challenge
    .getByRole("button", {
      name: "Cheer for Ava R. for completing Hill Sprints",
    })
    .click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await expect(picker.getByText("For Hill Sprints challenge")).toBeVisible();
  await picker.getByRole("button", { name: "Send Strong to Ava" }).click();
  await expect(page.getByRole("status")).toContainText("sent to Ava");

  await expect(
    page.getByRole("button", { name: "Cheer for Liam J." }),
  ).toBeVisible();
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

test("the sixth cheer to one teammate within 30 minutes shows only the limit error", async ({
  page,
}) => {
  await openReadyPage(page, "/team");

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: /Cheer for Liam J\./ }).click();
    const picker = page.getByRole("dialog", { name: "Cheer for Liam" });
    await picker.getByRole("button", { name: "Send Fire to Liam" }).click();
    await expect(picker).toBeHidden();
  }

  await page.getByRole("button", { name: /Cheer for Liam J\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Liam" });
  await picker.getByRole("button", { name: "Send Fire to Liam" }).click();

  await expect(picker.getByRole("alert")).toHaveText(
    "You have sent five cheers to this teammate in the last 30 minutes. Try again soon.",
  );
  await expect(picker).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
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

  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-mason-challenge-completion",
    },
    data: challengeEntry(),
  });
  expect(completion.status()).toBe(201);
  const challengeCheer = await api.post("/v1/reactions", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-inbound-challenge-1",
    },
    data: {
      recipientPlayerId: "player-mason",
      reactionType: "strong",
      context: {
        type: "challenge",
        teamId: "team-hill-striders",
        assignmentId: "assignment-hill-sprints",
      },
    },
  });
  expect(challengeCheer.status()).toBe(201);
  await api.dispose();

  await openReadyPage(page, "/me");
  await expect(
    page.getByRole("heading", { name: "Cheers for you" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Ava R\. saw you on the Weekly Effort leaderboard/),
  ).toBeVisible();
  await expect(page.getByText("🔥", { exact: true })).toBeVisible();
  await expect(page.getByText("Leaderboard", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Hill Sprints challenge", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Ava R\. cheered your Hill Sprints challenge/),
  ).toBeVisible();
});

function challengeEntry() {
  return {
    teamId: "team-hill-striders",
    activityDefinitionId: "hill-sprints",
    assignmentId: "assignment-hill-sprints",
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    result: { kind: "repetitions", value: 8, unit: "reps" },
    effortLevel: 4,
    exhaustionLevel: 3,
  };
}
