import { expect, request, test } from "@playwright/test";

import { loginAsAva, openReadyPage } from "./app-ready";

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

  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge).toBeVisible();
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(stage).toBeVisible();
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
  const playfieldBox = await lounge
    .locator(".team-lounge__playfield")
    .boundingBox();
  const dockBox = await lounge
    .getByRole("navigation", { name: "Lounge actions" })
    .boundingBox();
  expect(playfieldBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(playfieldBox!.y + playfieldBox!.height).toBeLessThanOrEqual(
    dockBox!.y,
  );
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
    .poll(async () => Number(await stage.getAttribute("data-player-y")))
    .toBeCloseTo(98, 0);
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
  ).toBeLessThanOrEqual(96.01);

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

  await lounge.getByRole("button", { name: "Emotes" }).click();
  await lounge.getByRole("button", { name: "Send Wave emote" }).click();
  await expect(lounge.getByRole("status")).toHaveText("Wave sent.");
  await expect(lounge.getByRole("img", { name: "Wave" })).toBeVisible();
  await lounge.getByRole("button", { name: "Emotes" }).click();
  await expect(
    lounge.getByRole("button", { name: "Send Heart emote" }),
  ).toBeDisabled();

  await lounge.getByRole("button", { name: "Stamps" }).click();
  const remainingBefore = Number.parseInt(
    (await lounge.getByText(/placements? left this week$/u).textContent()) ??
      "0",
    10,
  );
  await lounge.getByRole("button", { name: "Choose Bolt stamp" }).click();
  const placementSurface = lounge.getByRole("button", {
    name: "Place Bolt stamp on the boardwalk",
  });
  await placementSurface.click({ position: { x: 90, y: 140 } });
  await expect(lounge.getByRole("status")).toHaveText("Bolt placed.", {
    timeout: 10_000,
  });
  const editableBolt = lounge.getByRole("button", {
    name: "Bolt stamp, yours; tap or drag to move",
  });
  await expect(editableBolt).toBeVisible({ timeout: 10_000 });
  await editableBolt.click();
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toBeVisible();
  await lounge.getByRole("button", { name: "Make stamp larger" }).click();
  await lounge
    .getByRole("button", { name: "Rotate stamp right 15 degrees" })
    .click();
  await lounge.getByRole("button", { name: "Finish editing" }).click();
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toHaveCount(0);
  const movePlayfieldBox = await lounge
    .locator(".team-lounge__playfield")
    .boundingBox();
  const boltBeforeMove = await editableBolt.boundingBox();
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
  await page.mouse.up();
  await expect(lounge.getByRole("status")).toHaveText("Bolt updated.", {
    timeout: 10_000,
  });
  const boltAfterMove = await editableBolt.boundingBox();
  expect(boltAfterMove).not.toBeNull();
  expect(boltAfterMove!.y).toBeGreaterThanOrEqual(movePlayfieldBox!.y);
  expect(boltAfterMove!.y + boltAfterMove!.height).toBeLessThanOrEqual(
    movePlayfieldBox!.y + movePlayfieldBox!.height,
  );

  await page.mouse.move(
    boltAfterMove!.x + boltAfterMove!.width / 2,
    boltAfterMove!.y + boltAfterMove!.height / 2,
  );
  await page.mouse.down();
  await expect(lounge.getByLabel("Drop to remove item")).toBeVisible();
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
  await expect(lounge.getByRole("status")).toHaveText("Bolt removed.", {
    timeout: 10_000,
  });
  await expect(editableBolt).toHaveCount(0);
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
  expect(
    playfieldAboveSheetBox!.y + playfieldAboveSheetBox!.height,
  ).toBeLessThanOrEqual(itemSheetBox!.y);
  await expect(
    lounge.getByText(
      `${remainingBefore} ${remainingBefore === 1 ? "placement" : "placements"} left this week`,
    ),
  ).toBeVisible();
  await lounge.getByRole("button", { name: "Close item picker" }).click();

  await expect(lounge.getByRole("combobox")).toHaveCount(0);
  await expect(lounge).not.toContainText(/\bV[12]\b|alternative|preview/i);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
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

    const avaStage = avaLounge.getByLabel("Interactive lounge canvas");
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
