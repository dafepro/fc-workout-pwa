import { expect, request, test } from "@playwright/test";

import { loginAsAva, openReadyPage } from "./app-ready";
import {
  loungeNetworkBudget,
  observeLoungeNetwork,
} from "./lounge-network-budget";
import { loungePerformanceBudget } from "./lounge-performance-budget";

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

test("the consolidated Team view opens the canonical canvas Lounge at 320 pixels", async ({
  page,
}) => {
  const network = observeLoungeNetwork(page);
  const idleNetwork = observeLoungeNetwork(page);
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-today-qualification",
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
  await api.dispose();

  await page.setViewportSize({
    width: loungePerformanceBudget.layout.viewportWidthCssPx,
    height: 720,
  });
  const canvasLoadStartedAt = Date.now();
  await openReadyPage(page, "/team");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge).toBeVisible();
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(stage).toBeVisible();
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator("canvas")).toBeVisible({
    timeout: loungePerformanceBudget.latency.automatedReadyCeilingMs,
  });
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  expect(Date.now() - canvasLoadStartedAt).toBeLessThanOrEqual(
    loungePerformanceBudget.latency.automatedReadyCeilingMs,
  );
  const playfieldBox = await lounge
    .locator(".team-lounge__playfield")
    .boundingBox();
  const loungeBox = await lounge.boundingBox();
  const dockBox = await lounge
    .getByRole("navigation", { name: "Lounge actions" })
    .boundingBox();
  expect(playfieldBox).not.toBeNull();
  expect(loungeBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(playfieldBox!.y + playfieldBox!.height).toBeLessThanOrEqual(
    dockBox!.y,
  );
  for (const button of await lounge
    .getByRole("navigation", { name: "Lounge actions" })
    .getByRole("button")
    .all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(
      loungePerformanceBudget.layout.minInteractiveTargetCssPx,
    );
  }
  await expect(lounge.getByText(/drag to move/i)).toHaveCount(0);
  await expect(lounge.getByLabel("Mason C., you")).toBeVisible();
  const qualifiedAvatarBox = await lounge
    .getByLabel("Mason C., you")
    .boundingBox();
  expect(qualifiedAvatarBox).not.toBeNull();
  expect(qualifiedAvatarBox!.y).toBeGreaterThanOrEqual(playfieldBox!.y);
  expect(
    qualifiedAvatarBox!.y + qualifiedAvatarBox!.height,
  ).toBeLessThanOrEqual(playfieldBox!.y + playfieldBox!.height);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-ball-x")))
    .toBeGreaterThan(0);
  const startingBallX = Number(await stage.getAttribute("data-ball-x"));
  await stage.evaluate((element) => {
    let previous = Number(element.dataset.ballX);
    element.dataset.e2eBallMinX = String(previous);
    element.dataset.e2eBallMaxX = String(previous);
    element.dataset.e2eBallBounced = "false";
    new MutationObserver(() => {
      const current = Number(element.dataset.ballX);
      const maximum = Math.max(Number(element.dataset.e2eBallMaxX), current);
      element.dataset.e2eBallMinX = String(
        Math.min(Number(element.dataset.e2eBallMinX), current),
      );
      element.dataset.e2eBallMaxX = String(maximum);
      if (maximum > 90 && previous > current + 0.1) {
        element.dataset.e2eBallBounced = "true";
      }
      previous = current;
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-ball-x"],
    });
  });

  const playerName = lounge.getByText("You", { exact: true });
  await expect(playerName).toBeVisible();
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-x")))
    .toBeGreaterThan(0);
  const idleWindowSeconds = 3;
  idleNetwork.start();
  await page.waitForTimeout(idleWindowSeconds * 1_000);
  const idleNetworkUsage = await idleNetwork.finish();
  expect(idleNetworkUsage.permitRequests).toBe(0);
  expect(idleNetworkUsage.webSocketBytes).toBeLessThanOrEqual(
    loungeNetworkBudget.maxIdleWebSocketBytesPerSecond * idleWindowSeconds,
  );
  const canvas = stage.locator("canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const dragSelfToWorld = async (x: number, y: number) => {
    const current = await playerName.boundingBox();
    expect(current).not.toBeNull();
    await page.mouse.move(current!.x + current!.width / 2, current!.y + 30);
    await page.mouse.down();
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width * (x / 100),
      canvasBox!.y + canvasBox!.height * (y / 150),
      { steps: 24 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  await dragSelfToWorld(45, 98);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-x")))
    .toBeCloseTo(45, 0);
  await expect
    .poll(async () =>
      Math.abs(Number(await stage.getAttribute("data-player-y")) - 98),
    )
    .toBeLessThan(1.5);
  await dragSelfToWorld(55, 98);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-e2e-ball-max-x")))
    .toBeGreaterThan(startingBallX + 1);

  await dragSelfToWorld(96, 98);
  await expect
    .poll(() => stage.getAttribute("data-e2e-ball-bounced"), {
      timeout: 15_000,
    })
    .toBe("true");
  expect(
    Number(await stage.getAttribute("data-e2e-ball-max-x")),
  ).toBeLessThanOrEqual(96.05);

  await dragSelfToWorld(35, 98);
  await dragSelfToWorld(35, 75);
  await stage.evaluate((element) => {
    const current = Number(element.dataset.ballX);
    element.dataset.e2eBallMinX = String(current);
    element.dataset.e2eBallMaxX = String(current);
  });
  await dragSelfToWorld(45, 75);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-e2e-ball-max-x")))
    .toBeGreaterThan(52);

  const loungeSize = async () => {
    const box = await lounge.boundingBox();
    return { width: box?.width, height: box?.height };
  };
  const loungeSizeDelta = async (expected: {
    width: number | undefined;
    height: number | undefined;
  }) => {
    const actual = await loungeSize();
    return Math.max(
      Math.abs((actual.width ?? 0) - (expected.width ?? 0)),
      Math.abs((actual.height ?? 0) - (expected.height ?? 0)),
    );
  };
  const sizeBeforeReact = await loungeSize();
  const actionButtons = lounge
    .getByRole("navigation", { name: "Lounge actions" })
    .locator(":scope > button");
  await expect(actionButtons).toHaveCount(4);
  for (const [index, label] of ["Stamps", "Items", "Chat", "React"].entries()) {
    await expect(actionButtons.nth(index)).toContainText(label);
  }
  await expect
    .poll(() =>
      lounge
        .locator(".team-lounge__stage canvas")
        .evaluate((canvas) => getComputedStyle(canvas).touchAction),
    )
    .toBe("pan-y");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(4, 120);
  const pageScrollStart = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(pageScrollStart);
  const pageScrollDelta =
    (await page.evaluate(() => window.scrollY)) - pageScrollStart;

  await stage.scrollIntoViewIfNeeded();
  const visibleCanvasBox = await canvas.boundingBox();
  expect(visibleCanvasBox).not.toBeNull();
  const canvasScrollStart = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    visibleCanvasBox!.x + visibleCanvasBox!.width / 2,
    visibleCanvasBox!.y + visibleCanvasBox!.height / 2,
  );
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(canvasScrollStart);
  const canvasScrollDelta =
    (await page.evaluate(() => window.scrollY)) - canvasScrollStart;
  expect(canvasScrollDelta).toBe(pageScrollDelta);

  await lounge.getByRole("button", { name: "React" }).click();
  await expect.poll(() => loungeSizeDelta(sizeBeforeReact)).toBeLessThan(0.1);
  const reactTray = lounge.getByRole("dialog", { name: "Choose a reaction" });
  await expect(reactTray).toHaveAttribute("data-anchor", "react");
  await expect
    .poll(() =>
      reactTray.evaluate((node) => getComputedStyle(node).animationName),
    )
    .toBe("lounge-menu-up");
  await lounge.getByRole("button", { name: "Send Wave emote" }).click();
  await expect(lounge.getByRole("status")).toHaveText("Wave sent.");
  const wave = lounge.getByRole("img", { name: "Wave" });
  await expect(wave).toBeVisible();
  await expect
    .poll(() => wave.evaluate((node) => getComputedStyle(node).animationName))
    .toBe("lounge-avatar-reaction");
  await lounge.getByRole("button", { name: "Chat" }).click();
  const chatSets = lounge.getByRole("dialog", { name: "Choose a chat set" });
  await expect(chatSets).toHaveAttribute("data-anchor", "chat");
  await expect(
    lounge.getByRole("button", { name: "Set 2, locked" }),
  ).toBeDisabled();
  await expect(
    lounge.getByRole("button", { name: "Set 3, locked" }),
  ).toBeDisabled();
  await lounge.getByRole("button", { name: "Standard" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a Standard message" }),
  ).toBeVisible();
  await expect(
    lounge.getByRole("button", { name: / quick message$/u }),
  ).toHaveCount(10);
  await expect(
    lounge.getByRole("button", { name: "Send Nice! quick message" }),
  ).toBeDisabled();
  const niceQuickMessage = lounge.getByRole("button", {
    name: "Send Nice! quick message",
  });
  await expect(niceQuickMessage).toBeDisabled();
  await expect(niceQuickMessage).toBeEnabled({ timeout: 3_000 });
  await niceQuickMessage.click();
  await expect(lounge.getByRole("status").last()).toHaveText("Nice! sent.");
  await expect(lounge.locator(".team-lounge__avatar-phrase")).toHaveText(
    "Nice!",
  );
  await expect
    .poll(() =>
      lounge
        .locator(".team-lounge__avatar-phrase")
        .evaluate((node) => getComputedStyle(node).animationName),
    )
    .toBe("lounge-avatar-reaction");

  const sizeBeforeItems = await loungeSize();
  await lounge.getByRole("button", { name: "Stamps" }).click();
  await expect.poll(() => loungeSizeDelta(sizeBeforeItems)).toBeLessThan(0.1);
  const remainingBefore = Number.parseInt(
    (await lounge.getByText(/placements? left this week$/u).textContent()) ??
      "0",
    10,
  );
  await lounge
    .getByRole("button", { name: "Choose Soccer ball stamp" })
    .click();
  const placementSurface = lounge.getByRole("button", {
    name: "Place Soccer ball stamp on the boardwalk",
  });
  await placementSurface.click({ position: { x: 90, y: 140 } });
  await expect(lounge.getByRole("status")).toHaveText("Soccer ball placed.", {
    timeout: 10_000,
  });
  const editableStamp = lounge.locator(".team-lounge__placed-item--editable");
  await expect(editableStamp).toBeVisible({ timeout: 10_000 });
  await expect(editableStamp).toHaveAccessibleName(
    "Soccer ball stamp, yours; tap to edit",
  );
  await expect
    .poll(() =>
      editableStamp.evaluate((node) => ({
        borderStyle: getComputedStyle(node, "::after").borderStyle,
        background: getComputedStyle(node).backgroundColor,
        touchAction: getComputedStyle(node).touchAction,
      })),
    )
    .toEqual({
      borderStyle: "dashed",
      background: "rgba(0, 0, 0, 0)",
      touchAction: "pan-y",
    });
  const stampBox = await editableStamp.boundingBox();
  const stampArtBox = await editableStamp
    .locator(".team-lounge__item-art")
    .boundingBox();
  expect(stampBox).not.toBeNull();
  expect(stampArtBox).not.toBeNull();
  expect(stampArtBox!.x + stampArtBox!.width / 2).toBeCloseTo(
    stampBox!.x + stampBox!.width / 2,
    0,
  );
  expect(stampArtBox!.y + stampArtBox!.height / 2).toBeCloseTo(
    stampBox!.y + stampBox!.height / 2,
    0,
  );
  const boltBeforeIgnoredSlide = await editableStamp.boundingBox();
  expect(boltBeforeIgnoredSlide).not.toBeNull();
  await page.mouse.move(
    boltBeforeIgnoredSlide!.x + boltBeforeIgnoredSlide!.width / 2,
    boltBeforeIgnoredSlide!.y + boltBeforeIgnoredSlide!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    boltBeforeIgnoredSlide!.x + boltBeforeIgnoredSlide!.width / 2 + 24,
    boltBeforeIgnoredSlide!.y + boltBeforeIgnoredSlide!.height / 2 + 24,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(editableStamp).toHaveAccessibleName(
    "Soccer ball stamp, yours; tap to edit",
  );
  const boltAfterIgnoredSlide = await editableStamp.boundingBox();
  expect(boltAfterIgnoredSlide?.x).toBeCloseTo(boltBeforeIgnoredSlide!.x, 0);
  expect(boltAfterIgnoredSlide?.y).toBeCloseTo(boltBeforeIgnoredSlide!.y, 0);
  const sizeBeforeEditing = await loungeSize();
  await editableStamp.click();
  const radialEditor = lounge.getByRole("group", {
    name: "Edit selected stamp",
  });
  await expect(radialEditor).toBeVisible();
  await expect(radialEditor).toHaveAttribute("data-layout", "radial");
  await expect(editableStamp).toHaveAccessibleName(
    "Soccer ball stamp, yours; drag to move",
  );
  const radialEditorBox = await radialEditor
    .locator(".team-lounge__item-editor-ring")
    .boundingBox();
  const selectedStampBox = await editableStamp.boundingBox();
  expect(radialEditorBox).not.toBeNull();
  expect(selectedStampBox).not.toBeNull();
  const boltCenter = {
    x: selectedStampBox!.x + selectedStampBox!.width / 2,
    y: selectedStampBox!.y + selectedStampBox!.height / 2,
  };
  expect(boltCenter.x).toBeGreaterThan(radialEditorBox!.x);
  expect(boltCenter.x).toBeLessThan(
    radialEditorBox!.x + radialEditorBox!.width,
  );
  expect(boltCenter.y).toBeGreaterThan(radialEditorBox!.y);
  expect(boltCenter.y).toBeLessThan(
    radialEditorBox!.y + radialEditorBox!.height,
  );
  await expect.poll(() => loungeSizeDelta(sizeBeforeEditing)).toBeLessThan(0.1);
  network.start();
  await lounge.getByRole("button", { name: "Make stamp larger" }).click();
  await lounge
    .getByRole("button", { name: "Rotate stamp right 15 degrees" })
    .click();
  const finishEditing = lounge.getByRole("button", {
    name: "Finish editing",
  });
  await expect(finishEditing).toHaveText("✓");
  await finishEditing.click();
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toHaveCount(0);
  await editableStamp.click();
  await lounge
    .locator(".team-lounge__playfield")
    .click({ position: { x: 12, y: 12 } });
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toHaveCount(0);
  await editableStamp.click();
  const movePlayfieldBox = await lounge
    .locator(".team-lounge__playfield")
    .boundingBox();
  const boltBeforeMove = await editableStamp.boundingBox();
  expect(movePlayfieldBox).not.toBeNull();
  expect(boltBeforeMove).not.toBeNull();
  await page.mouse.move(
    boltBeforeMove!.x + boltBeforeMove!.width / 2,
    boltBeforeMove!.y + boltBeforeMove!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    boltBeforeMove!.x + boltBeforeMove!.width / 2 + 24,
    boltBeforeMove!.y + boltBeforeMove!.height / 2 + 24,
    { steps: 8 },
  );
  const boltDuringMove = await editableStamp.boundingBox();
  await page.mouse.up();
  const boltAfterRelease = await editableStamp.boundingBox();
  expect(boltDuringMove).not.toBeNull();
  expect(boltAfterRelease?.x).toBeCloseTo(boltDuringMove!.x, 0);
  expect(boltAfterRelease?.y).toBeCloseTo(boltDuringMove!.y, 0);
  await expect(lounge.getByRole("status")).toHaveText("Soccer ball updated.", {
    timeout: 10_000,
  });
  const boltAfterMove = await editableStamp.boundingBox();
  expect(boltAfterMove).not.toBeNull();
  expect(boltAfterMove!.y).toBeGreaterThanOrEqual(movePlayfieldBox!.y);
  expect(boltAfterMove!.y + boltAfterMove!.height).toBeLessThanOrEqual(
    movePlayfieldBox!.y + movePlayfieldBox!.height,
  );
  await expect(editableStamp).toBeEnabled();

  const sizeBeforeTrash = await loungeSize();
  await editableStamp.hover();
  await page.mouse.down();
  await expect(lounge.getByLabel("Drop to remove item")).toBeVisible();
  await expect.poll(() => loungeSizeDelta(sizeBeforeTrash)).toBeLessThan(0.1);
  const trashBox = await lounge.getByLabel("Drop to remove item").boundingBox();
  expect(trashBox).not.toBeNull();
  expect(movePlayfieldBox!.y + movePlayfieldBox!.height).toBeLessThanOrEqual(
    trashBox!.y,
  );
  await page.mouse.move(
    trashBox!.x + trashBox!.width / 2,
    trashBox!.y + trashBox!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(lounge.getByRole("status")).toHaveText("Soccer ball removed.", {
    timeout: 10_000,
  });
  await expect(editableStamp).toHaveCount(0);
  const networkUsage = await network.finish();
  const committedMutations = 4;
  expect(networkUsage.permitRequests).toBe(
    committedMutations * loungeNetworkBudget.permitRequestsPerCommittedMutation,
  );
  expect(networkUsage.permitKinds).toEqual([
    "scale",
    "rotation",
    "transform",
    "delete",
  ]);
  for (const bytes of networkUsage.permitRoundTripBytes) {
    expect(bytes).toBeLessThanOrEqual(
      loungeNetworkBudget.maxPermitRoundTripBytes,
    );
  }
  expect(networkUsage.webSocketBytes).toBeLessThanOrEqual(
    loungeNetworkBudget.maxEditSequenceWebSocketBytes,
  );
  await lounge.getByRole("button", { name: "Stamps" }).click();
  const itemSheetBox = await lounge
    .getByRole("dialog", { name: "Choose a Lounge item" })
    .boundingBox();
  const playfieldAboveSheetBox = await lounge
    .getByLabel("Interactive lounge canvas")
    .locator("..")
    .boundingBox();
  expect(itemSheetBox).not.toBeNull();
  expect(playfieldAboveSheetBox).not.toBeNull();
  expect(itemSheetBox!.y).toBeGreaterThanOrEqual(playfieldAboveSheetBox!.y);
  expect(itemSheetBox!.y + itemSheetBox!.height).toBeLessThanOrEqual(
    playfieldAboveSheetBox!.y + playfieldAboveSheetBox!.height,
  );
  await expect(
    lounge.getByText(
      `${remainingBefore} ${remainingBefore === 1 ? "placement" : "placements"} left this week`,
    ),
  ).toBeVisible();
  await lounge
    .getByRole("button", { name: "Close item picker" })
    .last()
    .click();

  await expect(lounge.getByRole("combobox")).toHaveCount(0);
  await expect(lounge.getByRole("textbox")).toHaveCount(0);
  await expect(lounge).not.toContainText(/\bV[12]\b|alternative|preview/i);
  expect(
    await page.evaluate(
      (maxOverflow) =>
        document.documentElement.scrollWidth <= window.innerWidth + maxOverflow,
      loungePerformanceBudget.layout.maxHorizontalOverflowCssPx,
    ),
  ).toBe(true);
});

test.describe("touch placement", () => {
  test.use({ hasTouch: true });

  test("Ava keeps an interrupted placement after refresh and hides empty badges", async ({
    page,
  }) => {
    const api = await request.newContext({ baseURL: apiBaseURL });
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: "Bearer e2e-player-ava",
        "Idempotency-Key": "browser-lounge-touch-ava-mini-goal",
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
    await api.dispose();

    await page.setViewportSize({ width: 320, height: 720 });
    await loginAsAva(page);
    await page.goto("/team");
    await page.locator("html[data-app-ready='true']").waitFor();
    const lounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    const stage = lounge.getByLabel("Interactive lounge canvas");
    await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
      "data-canvas-state",
      "ready",
    );
    await expect
      .poll(async () => Number(await stage.getAttribute("data-player-x")))
      .toBeGreaterThan(0);
    const currentAvatar = lounge.locator(
      ".team-lounge__shared-avatar[data-current='true'] .avatar",
    );
    await expect(currentAvatar).toBeVisible();
    await expect
      .poll(() =>
        currentAvatar.evaluate((node) => ({
          pointerEvents: getComputedStyle(node).pointerEvents,
          touchAction: getComputedStyle(node).touchAction,
        })),
      )
      .toEqual({ pointerEvents: "auto", touchAction: "none" });

    const items = lounge.getByRole("button", {
      name: /Items, \d+ placements? left/u,
    });
    await expect(items).toBeVisible();
    const initialLabel = await items.getAttribute("aria-label");
    const initialRemaining = Number.parseInt(
      initialLabel?.match(/Items, (\d+) placements? left/u)?.[1] ?? "0",
      10,
    );
    expect(initialRemaining).toBeGreaterThan(0);
    let reservedOnServer = false;
    const placementRoute =
      /\/api\/zoomigo\/v1\/teams\/team-hill-striders\/lounge\/placements$/u;
    await page.route(placementRoute, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      reservedOnServer = true;
      await route.abort("connectionfailed");
    });

    await items.click();
    await lounge.getByRole("button", { name: "Choose Mini goal item" }).click();
    let placementSurface = lounge.getByRole("button", {
      name: "Place Mini goal item on the boardwalk",
    });
    let placementBox = await placementSurface.boundingBox();
    expect(placementBox).not.toBeNull();
    await page.touchscreen.tap(
      placementBox!.x + placementBox!.width * 0.7,
      placementBox!.y + placementBox!.height * 0.72,
    );
    await expect.poll(() => reservedOnServer).toBe(true);
    await expect(lounge.getByRole("status")).toHaveText(
      "That item could not be placed.",
    );

    await page.unroute(placementRoute);
    await page.reload();
    await page.locator("html[data-app-ready='true']").waitFor();
    await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
      "data-canvas-state",
      "ready",
    );
    const placementLabel = (remaining: number) =>
      `Items, ${remaining} ${remaining === 1 ? "placement" : "placements"} left`;
    await expect(
      lounge.getByRole("button", {
        name: placementLabel(initialRemaining),
      }),
    ).toBeVisible();

    for (let index = 0; index < initialRemaining; index += 1) {
      await lounge
        .getByRole("button", {
          name: placementLabel(initialRemaining - index),
        })
        .click();
      await lounge
        .getByRole("button", { name: "Choose Mini goal item" })
        .click();
      placementSurface = lounge.getByRole("button", {
        name: "Place Mini goal item on the boardwalk",
      });
      placementBox = await placementSurface.boundingBox();
      expect(placementBox).not.toBeNull();
      await page.touchscreen.tap(
        placementBox!.x +
          placementBox!.width * Math.min(0.85, 0.55 + index * 0.08),
        placementBox!.y + placementBox!.height * 0.72,
      );
      await expect(
        lounge.getByRole("button", {
          name: placementLabel(initialRemaining - index - 1),
        }),
      ).toBeVisible({ timeout: 10_000 });
    }

    await expect(lounge.getByRole("status")).toHaveText("Mini goal placed.");
    await expect(placementSurface).toHaveCount(0);
    await expect(
      lounge
        .getByRole("button", {
          name: "Mini goal item, yours; tap to edit",
        })
        .first(),
    ).toBeVisible();
    await expect(
      lounge.getByRole("button", { name: "Items, 0 placements left" }),
    ).toBeVisible();
    await expect(lounge.locator(".team-lounge__placement-badge")).toHaveCount(
      0,
    );

    const canvasBox = await stage.locator("canvas").boundingBox();
    const playerBox = await currentAvatar.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(playerBox).not.toBeNull();
    const destinationX = 35;
    const origin = {
      x: playerBox!.x + playerBox!.width / 2,
      y: playerBox!.y + playerBox!.height / 2,
    };
    const destination = {
      x: canvasBox!.x + canvasBox!.width * (destinationX / 100),
      y: canvasBox!.y + canvasBox!.height * (85 / 150),
    };
    const cdp = await page.context().newCDPSession(page);
    const touchPoint = (x: number, y: number) => [
      { x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 },
    ];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touchPoint(origin.x, origin.y),
    });
    for (let step = 1; step <= 16; step += 1) {
      const progress = step / 16;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: touchPoint(
          origin.x + (destination.x - origin.x) * progress,
          origin.y + (destination.y - origin.y) * progress,
        ),
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
    await expect
      .poll(async () => Number(await stage.getAttribute("data-player-x")))
      .toBeCloseTo(destinationX, 0);
    await expect
      .poll(async () => Number(await stage.getAttribute("data-player-y")))
      .toBeCloseTo(85, 0);
  });
});

test("a replacement Ava tab recovers two interrupted placement holds", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-lounge-multi-recovery",
    },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      result: { kind: "repetitions", value: 8, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
      completionOutcome: "as_listed",
    },
  });
  expect(completion.status()).toBe(201);
  await api.dispose();

  await loginAsAva(page);
  await page.goto("/team");
  await page.locator("html[data-app-ready='true']").waitFor();
  const firstLounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(firstLounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );

  const interrupted = await page.evaluate(async () => {
    const teamID = "team-hill-striders";
    const playerID = "player-ava";
    const credentialResponse = await fetch(
      `/api/zoomigo/v1/teams/${teamID}/lounge/socket-ticket`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    if (!credentialResponse.ok) throw new Error("credential failed");
    const credential = (await credentialResponse.json()) as {
      roomId: string;
      placementCredits: number;
    };
    if (credential.placementCredits < 2) {
      throw new Error("Ava needs two placement credits");
    }
    const storagePrefix = `zoomigo:team-lounge:pending-placement:${teamID}:${playerID}:`;
    const attempts = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [index, idempotencyKey] of attempts.entries()) {
      localStorage.setItem(
        `${storagePrefix}${idempotencyKey}`,
        credential.roomId,
      );
      const reservation = await fetch(
        `/api/zoomigo/v1/teams/${teamID}/lounge/placements`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            roomId: credential.roomId,
            definitionId: "zoomigo-stamp-bolt",
            definitionVersion: 2,
            position: { x: 25 + index * 10, y: 70 },
          }),
        },
      );
      if (!reservation.ok) throw new Error("reservation failed");
    }
    return {
      credits: credential.placementCredits,
      storagePrefix,
    };
  });

  const secondPage = await page.context().newPage();
  try {
    await secondPage.goto("/team");
    await secondPage.locator("html[data-app-ready='true']").waitFor();
    const secondLounge = secondPage.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(secondLounge.locator(".team-lounge__world")).toHaveAttribute(
      "data-canvas-state",
      "ready",
    );
    await expect(
      secondLounge.getByRole("button", {
        name: `Items, ${interrupted.credits} placements left`,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        secondPage.evaluate(
          (storagePrefix) =>
            Object.keys(localStorage).filter((key) =>
              key.startsWith(storagePrefix),
            ).length,
          interrupted.storagePrefix,
        ),
      )
      .toBe(0);
  } finally {
    await secondPage.close();
  }
});

test("opening the same player Lounge in another tab retires the first tab cleanly", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "browser-lounge-superseded-ava",
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
  await api.dispose();

  await loginAsAva(page);
  await page.goto("/team");
  await page.locator("html[data-app-ready='true']").waitFor();
  const firstLounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(firstLounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );

  const secondPage = await page.context().newPage();
  try {
    await secondPage.goto("/team");
    await secondPage.locator("html[data-app-ready='true']").waitFor();
    const secondLounge = secondPage.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(secondLounge.locator(".team-lounge__world")).toHaveAttribute(
      "data-canvas-state",
      "ready",
    );
    await expect(firstLounge.getByRole("status")).toContainText(
      "The boardwalk is open in another tab.",
    );
    await expect(
      firstLounge.getByLabel("Interactive lounge canvas"),
    ).toHaveCount(0);
    await expect(
      firstLounge.getByRole("button", { name: "Try the boardwalk again" }),
    ).toHaveCount(0);
  } finally {
    await secondPage.close();
  }
});

test("two qualified players share Lounge presence and avatar movement", async ({
  browser,
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const player of ["mason", "ava"]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `browser-lounge-two-player-${player}`,
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
  }
  await api.dispose();

  const avaContext = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
  });
  const avaPage = await avaContext.newPage();
  try {
    await Promise.all([
      page.setViewportSize({ width: 320, height: 720 }),
      avaPage.setViewportSize({ width: 320, height: 720 }),
    ]);
    await openReadyPage(page, "/team");
    await loginAsAva(avaPage);
    await avaPage.goto("/team");
    await avaPage.locator("html[data-app-ready='true']").waitFor();

    const masonLounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    const avaLounge = avaPage.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(masonLounge.getByText("2 here")).toBeVisible({
      timeout: 15_000,
    });
    await expect(avaLounge.getByText("2 here")).toBeVisible({
      timeout: 15_000,
    });
    await expect(masonLounge.getByLabel("Ava R.")).toBeVisible();
    await expect(avaLounge.getByLabel("Mason C.")).toBeVisible();

    await masonLounge
      .getByRole("button", { name: /Items, \d+ placements? left/u })
      .click();
    await masonLounge
      .getByRole("button", { name: "Choose Wobble cone item" })
      .click();
    await masonLounge
      .getByRole("button", {
        name: "Place Wobble cone item on the boardwalk",
      })
      .click({ position: { x: 170, y: 160 } });
    await expect(masonLounge.getByRole("status")).toHaveText(
      "Wobble cone placed.",
      { timeout: 10_000 },
    );
    const ownedConeArtwork = masonLounge
      .getByRole("button", {
        name: "Wobble cone item, yours; tap to edit",
      })
      .locator("img");
    await expect(ownedConeArtwork).toHaveJSProperty("draggable", false);
    expect(
      await ownedConeArtwork.evaluate((artwork) => {
        const drag = new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
        });
        artwork.dispatchEvent(drag);
        return drag.defaultPrevented;
      }),
    ).toBe(true);
    const avaStage = avaLounge.getByLabel("Interactive lounge canvas");
    const teammateCone = avaLounge.getByLabel(
      "Wobble cone item placed by a teammate",
    );
    await expect(teammateCone).toBeVisible({ timeout: 10_000 });
    const [avaStageBox, teammateConeBox] = await Promise.all([
      avaStage.boundingBox(),
      teammateCone.boundingBox(),
    ]);
    expect(avaStageBox).not.toBeNull();
    expect(teammateConeBox).not.toBeNull();
    expect(teammateConeBox!.width).toBeLessThanOrEqual(
      avaStageBox!.width * 0.4,
    );
    expect(teammateConeBox!.height).toBeLessThanOrEqual(
      avaStageBox!.width * 0.4,
    );

    const masonSelf = masonLounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "You" });
    const masonOnAvaPage = avaLounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "Mason" });
    await masonSelf.scrollIntoViewIfNeeded();
    await masonOnAvaPage.scrollIntoViewIfNeeded();
    const masonStage = masonLounge.getByLabel("Interactive lounge canvas");
    await masonStage.scrollIntoViewIfNeeded();
    const masonCanvas = masonStage.locator("canvas");
    await expect(masonCanvas).toBeVisible();
    const masonCanvasBox = await masonCanvas.boundingBox();
    expect(masonCanvasBox).not.toBeNull();
    const startWorldX = Number(await masonStage.getAttribute("data-player-x"));
    const startWorldY = Number(await masonStage.getAttribute("data-player-y"));
    const targetWorldX = Math.max(20, startWorldX - 15);
    const startSelf = await masonSelf.boundingBox();
    const startRemote = await masonOnAvaPage.boundingBox();
    expect(startSelf).not.toBeNull();
    expect(startRemote).not.toBeNull();

    await page.mouse.move(
      startSelf!.x + startSelf!.width / 2,
      startSelf!.y + 30,
    );
    await page.mouse.down();
    await page.mouse.move(
      masonCanvasBox!.x + masonCanvasBox!.width * (targetWorldX / 100),
      masonCanvasBox!.y + masonCanvasBox!.height * (startWorldY / 150),
      { steps: 18 },
    );
    await page.mouse.up();

    await expect
      .poll(async () =>
        Math.abs(
          Number(await masonStage.getAttribute("data-player-x")) - targetWorldX,
        ),
      )
      .toBeLessThan(1.5);

    await expect
      .poll(async () => {
        const current = await masonOnAvaPage.boundingBox();
        return current ? Math.abs(current.x - startRemote!.x) : 0;
      })
      .toBeGreaterThan(3);

    await expect
      .poll(async () => Number(await avaStage.getAttribute("data-ball-x")))
      .toBeGreaterThan(0);
    const dragMasonToWorld = async (x: number, y: number) => {
      const current = await masonSelf.boundingBox();
      expect(current).not.toBeNull();
      await page.mouse.move(current!.x + current!.width / 2, current!.y + 30);
      await page.mouse.down();
      await page.mouse.move(
        masonCanvasBox!.x + masonCanvasBox!.width * (x / 100),
        masonCanvasBox!.y + masonCanvasBox!.height * (y / 150),
        { steps: 24 },
      );
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    const ballX = Number(await masonStage.getAttribute("data-ball-x"));
    const ballY = Number(await masonStage.getAttribute("data-ball-y"));
    await dragMasonToWorld(Math.max(8, ballX - 12), ballY);
    const remoteBallBeforeKick = Number(
      await avaStage.getAttribute("data-ball-x"),
    );
    await dragMasonToWorld(Math.min(92, ballX + 12), ballY);
    await expect
      .poll(async () => {
        const remoteBall = Number(await avaStage.getAttribute("data-ball-x"));
        return Math.abs(remoteBall - remoteBallBeforeKick);
      })
      .toBeGreaterThan(1);
  } finally {
    await avaContext.close();
  }
});

test("a qualified player sees their own avatar after a teammate wakes the room", async ({
  browser,
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const player of ["mason", "ava"]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `browser-lounge-wake-rejoin-${player}`,
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
  }
  await api.dispose();

  await openReadyPage(page, "/team");
  const currentAvatar = page
    .locator(".team-lounge__shared-avatar")
    .filter({ hasText: "You" })
    .locator(".avatar");
  await expect(currentAvatar).toBeVisible({ timeout: 15_000 });

  await page.goto("/me");
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.waitForTimeout(4_000);

  const avaContext = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
  });
  const avaPage = await avaContext.newPage();
  try {
    await loginAsAva(avaPage);
    await avaPage.goto("/team");
    await avaPage.locator("html[data-app-ready='true']").waitFor();
    await expect(avaPage.getByLabel("Mason visited this week")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/team");
    await page.locator("html[data-app-ready='true']").waitFor();
    const stage = page.getByLabel("Interactive lounge canvas");
    await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(currentAvatar).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => Number(await stage.getAttribute("data-player-x")))
      .toBeGreaterThan(0);

    await page.keyboard.press("p");
    await page.waitForTimeout(1_500);
    await expect(currentAvatar).toBeVisible();

    await page.keyboard.press("p");
    await page.waitForTimeout(500);
    const masonLounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await masonLounge.getByRole("button", { name: "React" }).click();
    await masonLounge.getByRole("button", { name: "Send Wave emote" }).click();
    await expect(masonLounge.getByRole("status")).toHaveText("Wave sent.");
  } finally {
    await avaContext.close();
  }
});
