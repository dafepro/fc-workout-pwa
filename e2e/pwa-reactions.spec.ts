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

  await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await expect(picker).toBeVisible();
  await expect(picker.getByText("For Team progress")).toBeVisible();

  const fire = picker.getByRole("button", { name: "Send Fire to Ava" });
  await expect(fire.getByText("Fire", { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fire.click();

  const sentStatus = page.locator(".reaction-sent-status");
  await expect(sentStatus).toContainText("sent to Ava");
  await expect(sentStatus).not.toContainText(/left|remaining/i);
  await expect
    .poll(() =>
      sentStatus.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe("none");
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Send some energy" }),
  ).toHaveCount(0);
});

test("the mobile cheer picker stays above the fixed bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 500 });
  await openReadyPage(page, "/team");

  await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  const fire = picker.getByRole("button", { name: "Send Fire to Ava" });

  await expect(fire).toBeVisible();
  await expect
    .poll(() =>
      picker.evaluate((dialog) => {
        const navigation = document.querySelector(".player-bottom-nav");
        if (!(navigation instanceof HTMLElement)) return "navigation missing";

        const dialogBounds = dialog.getBoundingClientRect();
        const navigationBounds = navigation.getBoundingClientRect();
        const overlapTop = Math.max(dialogBounds.top, navigationBounds.top);
        const overlapBottom = Math.min(
          dialogBounds.bottom,
          navigationBounds.bottom,
        );
        if (overlapBottom <= overlapTop) return "elements do not overlap";

        const topmost = document.elementFromPoint(
          dialogBounds.left + dialogBounds.width / 2,
          overlapTop + (overlapBottom - overlapTop) / 2,
        );
        if (topmost === dialog || dialog.contains(topmost)) {
          return "reaction picker";
        }
        if (!(topmost instanceof HTMLElement)) return "no painted element";
        return `covered by ${topmost.tagName.toLowerCase()}.${topmost.className}`;
      }),
    )
    .toBe("reaction picker");
});

test("a completed shared challenge becomes the teammate's single prioritized cheer context", async ({
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

  const challenge = page.getByRole("region", { name: "This week" });
  await expect(
    challenge.getByText("1 of 12 teammates completed"),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Teammate activity" })
    .getByRole("button", {
      name: "Cheer for Ava R. for Hill Sprints challenge",
    })
    .click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await expect(picker.getByText("For Hill Sprints challenge")).toBeVisible();
  await picker.getByRole("button", { name: "Send Strong to Ava" }).click();
  await expect(page.locator(".reaction-sent-status")).toContainText(
    "sent to Ava",
  );
  await expect(
    page
      .getByRole("region", { name: "Teammate activity" })
      .getByRole("button", { name: /Cheer for Ava R\./ }),
  ).toHaveCount(1);
});

test("the picker is usable for a second teammate after a successful cheer", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const liamActivity = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-liam",
      "Idempotency-Key": "browser-liam-team-activity",
    },
    data: participationEntry(),
  });
  expect(liamActivity.status()).toBe(201);
  await api.dispose();
  await openReadyPage(page, "/team");

  await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  await page
    .getByRole("dialog", { name: "Cheer for Ava" })
    .getByRole("button", { name: "Send Fire to Ava" })
    .click();
  await expect(page.locator(".reaction-sent-status")).toContainText(
    "sent to Ava",
  );

  await page.getByRole("button", { name: /Cheer for Liam J\./ }).click();
  const secondPicker = page.getByRole("dialog", { name: "Cheer for Liam" });
  const secondCheer = secondPicker.getByRole("button", {
    name: "Send Clap to Liam",
  });
  await expect(secondPicker).toBeVisible();
  await expect(secondCheer).toBeEnabled();
  await secondCheer.click();

  await expect(page.locator(".reaction-sent-status")).toContainText(
    "sent to Liam",
  );
  await expect(secondPicker).toBeHidden();
});

test("the sixth cheer to one teammate within 30 minutes shows only the limit error", async ({
  page,
}) => {
  await openReadyPage(page, "/team");

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
    const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
    await picker.getByRole("button", { name: "Send Fire to Ava" }).click();
    await expect(picker).toBeHidden();
  }

  await page.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await picker.getByRole("button", { name: "Send Fire to Ava" }).click();

  await expect(picker.getByRole("alert")).toHaveText(
    "You have sent five cheers to this teammate in the last 30 minutes. Try again soon.",
  );
  await expect(picker).toBeVisible();
  await expect(page.locator(".reaction-sent-status")).toHaveCount(0);
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

test("Me shows twenty recent cheers before playfully loading more", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const senders = [
    "e2e-player-ava",
    "e2e-player-liam",
    "e2e-player-noah",
    "e2e-player-zoe",
    "e2e-player-jayden",
  ];
  for (let index = 0; index < 21; index += 1) {
    const response = await api.post("/v1/reactions", {
      headers: {
        Authorization: `Bearer ${senders[Math.floor(index / 5)]}`,
        "Idempotency-Key": `browser-paged-cheer-${index}`,
      },
      data: {
        recipientPlayerId: "player-mason",
        reactionType: "clap",
        context: {
          type: "team_progress",
          teamId: "team-hill-striders",
          period: "weekly",
        },
      },
    });
    expect(response.status()).toBe(201);
  }
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/me");

  const cheers = page.locator(".reaction-badge-list__item");
  await expect(page.getByText(/Last 7 days/)).toBeVisible();
  await expect(cheers).toHaveCount(20);
  const more = page.getByRole("button", { name: /More cheers/ });
  await expect(more).toBeVisible();
  await more.click();

  await expect(cheers).toHaveCount(21);
  await expect(more).toHaveCount(0);
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

function participationEntry() {
  return {
    teamId: "team-hill-striders",
    activityDefinitionId: "recovery-walk-jog",
    occurredAt: new Date(Date.now() - 90_000).toISOString(),
    result: { kind: "duration", value: 20, unit: "minutes" },
    effortLevel: 3,
    exhaustionLevel: 2,
  };
}
