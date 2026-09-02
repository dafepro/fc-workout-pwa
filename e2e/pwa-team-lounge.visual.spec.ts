import { expect, request, test } from "@playwright/test";

import { loginAsAva, openReadyPage } from "./app-ready";
import { animatedBorderAvatar } from "./avatar-fixtures";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-visual-qualification",
    },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      result: { kind: "repetitions", value: 8, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
      completionOutcome: "as_listed",
    },
  });
  expect(completion.status()).toBe(201);
  const teammateCompletion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-lounge-visual-bench",
    },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      result: { kind: "repetitions", value: 8, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
      completionOutcome: "as_listed",
    },
  });
  expect(teammateCompletion.status()).toBe(201);
  const avatar = await api.put("/v1/me/avatar", {
    headers: { Authorization: "Bearer e2e-player-mason" },
    data: { configuration: animatedBorderAvatar },
  });
  expect(avatar.status()).toBe(200);
  const teammateAvatar = await api.put("/v1/me/avatar", {
    headers: { Authorization: "Bearer e2e-player-ava" },
    data: {
      configuration: { ...animatedBorderAvatar, head: "cheetah" },
    },
  });
  expect(teammateAvatar.status()).toBe(200);
  await api.dispose();
});

test("the moving system ball spins around its own visual center", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  const ball = lounge.getByRole("img", { name: "Beach ball item" });
  await expect(ball).toBeVisible();

  const pivotErrors = await ball.evaluate(async (wrapper) => {
    const artwork = wrapper.querySelector<HTMLElement>(
      ".team-lounge__item-art",
    );
    if (!artwork) return [];

    const originalTransform = wrapper.style.transform;
    const errors: number[] = [];
    for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      wrapper.style.transform = originalTransform.replace(
        /rotate\([^)]*\)/u,
        `rotate(${rotation}rad)`,
      );
      await new Promise(requestAnimationFrame);
      const wrapperBounds = wrapper.getBoundingClientRect();
      const artworkBounds = artwork.getBoundingClientRect();
      errors.push(
        Math.hypot(
          wrapperBounds.left +
            wrapperBounds.width / 2 -
            (artworkBounds.left + artworkBounds.width / 2),
          wrapperBounds.top +
            wrapperBounds.height / 2 -
            (artworkBounds.top + artworkBounds.height / 2),
        ),
      );
    }
    wrapper.style.transform = originalTransform;
    return errors;
  });

  expect(pivotErrors).toHaveLength(4);
  expect(Math.max(...pivotErrors)).toBeLessThan(1);
});

test("the 320px Lounge keeps its approved visual states", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator("canvas")).toBeVisible();
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await expect(lounge.getByLabel("Mason C., you")).toHaveCount(1);
  await expect(lounge.getByText("You", { exact: true })).toBeVisible();
  const benchAvatar = lounge.getByRole("img", {
    name: "Ava R., finished and resting on the bench",
  });
  await expect(benchAvatar).toBeVisible();
  await benchAvatar.evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  await expect(
    benchAvatar.locator(".team-lounge__avatar-decoration--bench"),
  ).toHaveScreenshot("team-lounge-bench-avatar.png", {
    animations: "disabled",
    maxDiffPixels: 50,
  });
  const dock = lounge.getByRole("navigation", { name: "Lounge actions" });
  const revealDock = async () => {
    await dock.scrollIntoViewIfNeeded();
    await expect(dock).toBeVisible();
  };
  await revealDock();

  await expect(lounge).toHaveScreenshot("team-lounge-idle.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });
  await expect(
    lounge.getByRole("button", { name: "Mason C., you" }),
  ).toHaveScreenshot("team-lounge-avatar.png", {
    animations: "disabled",
    maxDiffPixels: 100,
  });

  await lounge.getByRole("button", { name: "Enter full screen" }).click();
  await expect(lounge).toHaveAttribute("data-fullscreen", "true");
  expect(
    await lounge.evaluate((region) => {
      const bounds = region.getBoundingClientRect();
      return {
        top: Math.round(bounds.top),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    }),
  ).toEqual({
    top: 0,
    left: 0,
    width: 320,
    height: 720,
    viewportWidth: 320,
    viewportHeight: 720,
  });
  await expect(lounge).toHaveScreenshot("team-lounge-fullscreen.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });
  await lounge.getByRole("button", { name: "Exit full screen" }).click();
  await expect(lounge).not.toHaveAttribute("data-fullscreen");

  await lounge.getByRole("button", { name: "React" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a reaction" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-react.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });

  await lounge.getByRole("button", { name: "Chat" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a chat set" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-chat-sets.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });

  await lounge.getByRole("button", { name: "Chat" }).click();
  await lounge
    .getByRole("button", { name: "Quick-message pack settings" })
    .click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose chat packs" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-chat-settings.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });
  await lounge.getByRole("button", { name: "Close chat settings" }).click();

  await lounge.getByRole("button", { name: "Chat" }).click();
  await lounge.getByRole("button", { name: "Standard" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a Standard message" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-chat-standard.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });

  await lounge.getByRole("button", { name: /^Items,/u }).click();
  const cannonChoice = lounge.getByRole("button", {
    name: "Choose Ball cannon item",
  });
  await expect(cannonChoice).toBeVisible();
  await cannonChoice.scrollIntoViewIfNeeded();
  await expect(cannonChoice.locator("img")).toHaveAttribute(
    "src",
    "/team-lounge/items/ball-cannon-v1.svg",
  );
  expect(
    await lounge.evaluate((region) => ({
      menu: Number(
        getComputedStyle(region.querySelector(".team-lounge__menu-overlay")!)
          .zIndex,
      ),
      actions: Number(
        getComputedStyle(region.querySelector(".team-lounge__actions")!).zIndex,
      ),
      currentAvatar: Number(
        getComputedStyle(
          region.querySelector(
            ".team-lounge__shared-avatar[data-current='true']",
          )!,
        ).zIndex,
      ),
    })),
  ).toEqual({ menu: 60, actions: 50, currentAvatar: 31 });
  await expect(lounge).toHaveScreenshot("team-lounge-items-cannon.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });
  await lounge
    .getByRole("button", { name: "Close item picker" })
    .last()
    .click();

  await lounge.getByRole("button", { name: "Stamps" }).click();
  await lounge
    .getByRole("button", { name: "Choose Certified silly goose stamp" })
    .click();
  await lounge
    .getByRole("button", {
      name: "Place Certified silly goose stamp on the boardwalk",
    })
    .click({ position: { x: 225, y: 185 } });
  await expect(lounge.getByRole("status")).toHaveText(
    "Certified silly goose placed.",
    {
      timeout: 10_000,
    },
  );
  const stamp = lounge.locator(".team-lounge__placed-item--editable");
  await expect(stamp).toBeVisible();
  const stampArt = stamp.getByRole("presentation");
  await expect(stampArt).toHaveAttribute(
    "src",
    "/team-lounge/stamps/silly-goose-v1.svg",
  );
  await expect
    .poll(() =>
      stampArt.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await stamp.click();
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toBeVisible();
  await revealDock();
  await expect(lounge).toHaveScreenshot("team-lounge-stamp-editor.png", {
    animations: "disabled",
    maxDiffPixels: 1_000,
  });

  await lounge.getByRole("button", { name: "Finish editing" }).click();
  await lounge.getByRole("button", { name: /^Items,/u }).click();
  await lounge.getByRole("button", { name: "Choose Ball cannon item" }).click();
  await lounge
    .getByRole("button", {
      name: "Place Ball cannon item on the boardwalk",
    })
    .click({ position: { x: 160, y: 185 } });
  await expect(lounge.getByRole("status")).toHaveText("Ball cannon placed.", {
    timeout: 10_000,
  });

  const cannon = lounge.getByRole("button", {
    name: "Ball cannon item, yours; tap to edit",
  });
  const systemBall = lounge.getByRole("img", { name: "Beach ball item" });
  const currentAvatar = lounge.locator(
    ".team-lounge__shared-avatar[data-current='true']",
  );
  await expect(cannon).toBeVisible();
  await expect(systemBall).toBeVisible();
  expect(
    await lounge.evaluate((region) => {
      const stamp = region.querySelector<HTMLElement>(
        ".team-lounge__placed-item--stamp",
      )!;
      const cannon = region.querySelector<HTMLElement>(
        '[aria-label^="Ball cannon item"]',
      )!;
      const ball = region.querySelector<HTMLElement>(
        '[aria-label="Beach ball item"]',
      )!;
      const itemPlane = stamp.parentElement!;
      const avatar = region.querySelector<HTMLElement>(
        ".team-lounge__shared-avatar[data-current='true']",
      )!;
      const stampBounds = stamp.getBoundingClientRect();
      const overlapOrder = document
        .elementsFromPoint(
          stampBounds.left + stampBounds.width / 2,
          stampBounds.top + stampBounds.height / 2,
        )
        .map((element) =>
          element.closest<HTMLElement>(".team-lounge__placed-item"),
        );
      return {
        oneItemPlane:
          cannon.parentElement === itemPlane &&
          ball.parentElement === itemPlane,
        stamp: getComputedStyle(stamp).zIndex,
        cannon: getComputedStyle(cannon).zIndex,
        ball: getComputedStyle(ball).zIndex,
        itemPlane: getComputedStyle(itemPlane).zIndex,
        avatar: getComputedStyle(avatar).zIndex,
        cannonBeforeStamp:
          overlapOrder.indexOf(cannon) < overlapOrder.indexOf(stamp),
      };
    }),
  ).toEqual({
    oneItemPlane: true,
    stamp: "4",
    cannon: "10",
    ball: "20",
    itemPlane: "auto",
    avatar: "31",
    cannonBeforeStamp: true,
  });
  await expect(currentAvatar).toHaveCSS("z-index", "31");
  await expect(lounge.locator(".team-lounge__playfield")).toHaveScreenshot(
    "team-lounge-stamp-layering.png",
    {
      animations: "disabled",
      maxDiffPixels: 1_000,
    },
  );
});

test("overlapping live avatars preserve one complete local stack", async ({
  browser,
  page,
}) => {
  const avaContext = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
  });
  const avaPage = await avaContext.newPage();
  try {
    await Promise.all([
      page.setViewportSize({ width: 320, height: 720 }),
      avaPage.setViewportSize({ width: 320, height: 720 }),
    ]);
    await openReadyPage(page, "/team?view=lounge");
    await loginAsAva(avaPage);
    await avaPage.goto("/team?view=lounge");
    await avaPage.locator("html[data-app-ready='true']").waitFor();

    const lounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(lounge.getByText("2 here")).toBeVisible({ timeout: 15_000 });
    await expect(
      lounge.locator(".team-lounge__shared-avatar[data-current='true']"),
    ).toHaveCSS("z-index", "31");
    await expect(
      lounge.locator(".team-lounge__shared-avatar[data-presence='active']"),
    ).toHaveCSS("z-index", "30");
    await expect(lounge.locator(".team-lounge__playfield")).toHaveScreenshot(
      "team-lounge-avatar-overlap.png",
      {
        animations: "disabled",
        maxDiffPixels: 1_000,
      },
    );
  } finally {
    await avaContext.close();
  }
});
