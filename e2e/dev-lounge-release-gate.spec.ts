import { expect, test } from "@playwright/test";

test("a qualified player enters the Lounge and sees their own avatar", async ({
  page,
}) => {
  test.skip(
    process.env.DEV_LOUNGE_RELEASE_GATE !== "true",
    "the deployed-dev release gate is opt-in",
  );

  const previewPassword = requiredEnvironment("DEV_ACCESS_PASSWORD");
  await page.goto("/dev-access");
  await page.getByLabel("Password").fill(previewPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  const player = page
    .locator(".dev-player-list li")
    .filter({ has: page.getByRole("heading", { name: /^Mason/ }) });
  await player.getByRole("link").click();
  await page.locator("form[data-credential-ready='true']").waitFor();
  await page.getByLabel("Four-digit PIN").fill("1111");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.getByRole("link", { name: /Log another activity/i }).click();
  await expect(
    page.getByRole("heading", { name: "Log Another Activity" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose an activity", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Hill Sprints/i }).click();
  const qualificationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Save / }).click();
  const qualificationResponse = await qualificationResponsePromise;
  expect(qualificationResponse.status()).toBe(201);
  const qualification = (await qualificationResponse.json()) as { id: string };

  try {
    const teamLoungeLink = page.getByRole("link", {
      name: /Team lounge|Go to Team/,
    });
    await expect(teamLoungeLink).toContainText(
      "Cheer the team or visit the boardwalk.",
    );
    await teamLoungeLink.click();
    await page.locator("html[data-app-ready='true']").waitFor();
    const loungePreview = page.getByRole("region", {
      name: "Team Lounge preview",
    });
    const openLounge = loungePreview.getByRole("button", {
      name: "Open Lounge",
    });
    await expect(openLounge).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Lounge" })).toHaveCount(
      1,
    );
    await openLounge.click();
    const lounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    const stage = lounge.getByLabel("Interactive lounge canvas");
    const ownAvatar = lounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "You" });
    await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(ownAvatar.getByText("You")).toBeVisible({ timeout: 15_000 });
    await expect(ownAvatar.locator(".avatar")).toHaveCount(0);
    await expect(lounge.getByText("Canvas connection error.")).toHaveCount(0);
    const unlockResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/zoomigo/__dev/me/unlocks") &&
        response.request().method() === "POST",
    );
    await lounge.getByRole("button", { name: "Unlock test items" }).click();
    const unlockResponse = await unlockResponsePromise;
    expect(unlockResponse.status()).toBe(200);
    await expect(lounge.getByText("Test items unlocked")).toBeVisible();
    await lounge.getByRole("button", { name: /^Items,/u }).click();
    const cannonChoice = lounge.getByRole("button", {
      name: "Choose Ball cannon item",
    });
    await expect(cannonChoice).toBeVisible();
    const cannonImage = cannonChoice.locator("img");
    await expect(cannonImage).toHaveAttribute(
      "src",
      "/team-lounge/items/ball-cannon-v1.svg",
    );
    await expect
      .poll(() =>
        cannonImage.evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await lounge
      .getByRole("button", { name: "Close item picker" })
      .last()
      .click();
    await lounge.getByRole("button", { name: /^Stamps,/u }).click();
    for (const label of [
      "Shield",
      "Target",
      "Rainbow",
      "Lion",
      "Rocket",
      "Sparkles",
    ]) {
      await expect(
        lounge.getByRole("button", { name: `Choose ${label} stamp` }),
      ).toHaveCount(1);
    }
    await lounge
      .getByRole("button", { name: "Close item picker" })
      .last()
      .click();

    await page.setViewportSize({ width: 320, height: 800 });
    await lounge.getByRole("button", { name: "Enter full screen" }).click();
    await expect(lounge).toHaveAttribute("data-fullscreen", "true");
    const geometry = await lounge.evaluate((region) => {
      const stageElement = region.querySelector(".team-lounge__stage");
      const dockElement = region.querySelector(".team-lounge__actions");
      if (!stageElement || !dockElement) return null;
      const stageBox = stageElement.getBoundingClientRect();
      const dockBox = dockElement.getBoundingClientRect();
      const playerX = Number(stageElement.getAttribute("data-player-x"));
      const playerY = Number(stageElement.getAttribute("data-player-y"));
      return {
        loungeBounds: {
          top: Math.round(region.getBoundingClientRect().top),
          left: Math.round(region.getBoundingClientRect().left),
          width: Math.round(region.getBoundingClientRect().width),
          height: Math.round(region.getBoundingClientRect().height),
        },
        stageAboveDock: stageBox.bottom <= dockBox.top + 1,
        avatarInsideStage:
          playerX >= 0 && playerX <= 100 && playerY >= 0 && playerY <= 150,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry).toEqual({
      loungeBounds: { top: 0, left: 0, width: 320, height: 800 },
      stageAboveDock: true,
      avatarInsideStage: true,
      documentWidth: 320,
    });
    await lounge.getByRole("button", { name: "Exit full screen" }).click();
    await expect(lounge).not.toHaveAttribute("data-fullscreen");
    await expect(ownAvatar.getByText("You")).toBeVisible();
  } finally {
    await page.goto(`/sessions/${encodeURIComponent(qualification.id)}`);
    await expect(
      page.getByRole("heading", { name: "Hill Sprints" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete session" }).click();
    const cleanupResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            `/api/zoomigo/v1/training-entries/${encodeURIComponent(qualification.id)}`,
          ) && response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Yes, delete" }).click();
    const cleanupResponse = await cleanupResponsePromise;
    expect(cleanupResponse.status()).toBe(204);
    // The trusted gate also verifies selected revisions with the newer Me flow.
    await expect.soft(page).toHaveURL(/\/(?:me#sessions)?$/);
  }
});

// Preview credentials must never appear in retained traces or screenshots.
test.use({ trace: "off", screenshot: "off", video: "off" });

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
