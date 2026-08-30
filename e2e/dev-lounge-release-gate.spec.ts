import { expect, request, test } from "@playwright/test";

interface DevAccess {
  players: { name: string; loginUrl: string }[];
  pin: string;
}

test("a qualified player enters the Lounge and sees their own avatar", async ({
  page,
}) => {
  test.skip(
    process.env.DEV_LOUNGE_RELEASE_GATE !== "true",
    "the deployed-dev release gate is opt-in",
  );

  const apiBaseURL = requiredEnvironment("DEV_SMOKE_API_BASE_URL");
  const gatewayToken = requiredEnvironment("DEV_API_GATEWAY_TOKEN");
  const previewPassword = requiredEnvironment("DEV_ACCESS_PASSWORD");
  const api = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { "X-Zoomigo-Dev-Gateway": gatewayToken },
  });
  const accessResponse = await api.get("/__dev/access");
  expect(accessResponse.ok()).toBe(true);
  const access = (await accessResponse.json()) as DevAccess;
  await api.dispose();

  const player = access.players.find(({ name }) => name.startsWith("Mason"));
  expect(player, "the release fixture must include Mason").toBeTruthy();
  await page.goto(player!.loginUrl);
  await page.getByLabel("Password").fill(previewPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Four-digit PIN").fill(access.pin);
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
    const teamLoungeLink = page.getByRole("link", { name: /Team lounge/ });
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
    await expect(lounge.getByText("The boardwalk could not open.")).toHaveCount(
      0,
    );
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
    await expect(page).toHaveURL(/\/$/);
  }
});

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
