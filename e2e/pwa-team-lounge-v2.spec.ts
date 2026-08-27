import {
  expect,
  request,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { loginAsAva, loginAsMason } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
const masonHeaders = { Authorization: "Bearer e2e-player-mason" };
const avaHeaders = { Authorization: "Bearer e2e-player-ava" };
const firstLoungeDay = "2026-08-26T17:00:00Z";
const secondLoungeDay = "2026-08-27T17:00:00Z";
const nextLoungeWeek = "2026-08-31T17:00:00Z";
const touchRegressionDay = "2026-08-19T17:00:00Z";

test.beforeEach(async ({}, testInfo) => {
  const fixtureNow = testInfo.title.includes("two players")
    ? firstLoungeDay
    : touchRegressionDay;
  const api = await request.newContext({ baseURL: apiBaseURL });
  const reset = await api.post("/__e2e/reset", {
    headers: {
      "X-E2E-Reset-Key": resetKey,
      "X-E2E-Now": fixtureNow,
    },
  });
  expect(reset.status()).toBe(204);
  const rest = await api.post("/v1/teams/team-hill-striders/canvas/rest", {
    headers: masonHeaders,
    data: {},
  });
  expect(rest.status()).toBe(204);
  const avaRest = await api.post("/v1/teams/team-hill-striders/canvas/rest", {
    headers: avaHeaders,
    data: {},
  });
  expect(avaRest.status()).toBe(204);
  await api.dispose();
});

test("two players keep separate stamps through reconnect, day rollover, and week rollover", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const masonContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
  });
  const avaContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
  });
  await enableV2(masonContext);
  await enableV2(avaContext);
  const masonPage = await masonContext.newPage();
  let avaPage = await avaContext.newPage();

  await loginAsMason(masonPage);
  await loginAsAva(avaPage);
  await Promise.all([openSharedLounge(masonPage), openSharedLounge(avaPage)]);

  const masonLounge = sharedLounge(masonPage);
  const avaLounge = sharedLounge(avaPage);
  await expect(masonPage.getByLabel("2 players here")).toBeVisible();
  await expect(avaPage.getByLabel("2 players here")).toBeVisible();
  await expect(masonLounge.getByLabel("Mason C., you")).toBeVisible();
  await expect(masonLounge.getByLabel("Ava R.")).toBeVisible();
  await expect(avaLounge.getByLabel("Ava R., you")).toBeVisible();
  await expect(avaLounge.getByLabel("Mason C.")).toBeVisible();
  const beachBall = masonLounge.getByRole("img", { name: "Beach ball" });
  await expect(beachBall).toBeVisible();
  await expect
    .poll(async () => (await beachBall.boundingBox())?.width ?? 0)
    .toBeGreaterThan(30);

  await masonPage.getByRole("button", { name: "Emotes" }).click();
  await masonPage.getByRole("button", { name: "Send Wave emote" }).click();
  const remoteWave = avaLounge
    .getByLabel("Mason C.")
    .locator(".team-lounge-v2__participant-emote");
  await expect(remoteWave).toHaveText("👋");
  await expect(remoteWave).toHaveCount(0, { timeout: 4_000 });

  await placeStamp(masonPage, "Bolt", { x: 118, y: 190 });
  await expect(
    masonPage.getByRole("button", {
      name: "Bolt stamp, yours; tap then drag to move",
    }),
  ).toBeVisible();
  const masonStampOnAva = avaPage.getByLabel("Bolt stamp placed by a teammate");
  await expect(masonStampOnAva).toBeVisible();

  await placeStamp(avaPage, "Star", { x: 230, y: 245 });
  const avaStamp = avaPage.getByRole("button", {
    name: "Star stamp, yours; tap then drag to move",
  });
  await expect(avaStamp).toBeVisible();
  await expect(
    masonPage.getByLabel("Star stamp placed by a teammate"),
  ).toBeVisible();

  expect(await masonStampOnAva.evaluate((element) => element.tagName)).toBe(
    "SPAN",
  );
  const masonStamp = masonPage.getByRole("button", {
    name: "Bolt stamp, yours; tap then drag to move",
  });
  await masonStamp.click();
  const remoteStyleBefore = await masonStampOnAva.getAttribute("style");
  await masonPage
    .getByRole("button", { name: "Rotate stamp right 15 degrees" })
    .click();
  await expect
    .poll(() => masonStampOnAva.getAttribute("style"))
    .not.toBe(remoteStyleBefore);

  await Promise.all([masonPage.reload(), avaPage.reload()]);
  await Promise.all([
    waitForSharedLounge(masonPage),
    waitForSharedLounge(avaPage),
  ]);
  await expect(
    masonPage.getByRole("button", {
      name: "Bolt stamp, yours; tap then drag to move",
    }),
  ).toBeVisible();
  await expect(
    avaPage.getByRole("button", {
      name: "Star stamp, yours; tap then drag to move",
    }),
  ).toBeVisible();

  await avaPage.close();
  await masonPage.reload();
  await waitForSharedLounge(masonPage);
  await expect(
    sharedLounge(masonPage).getByLabel("Ava R. stopped by this week"),
  ).toBeVisible();
  avaPage = await avaContext.newPage();
  await openSharedLounge(avaPage);
  await expect(
    sharedLounge(masonPage).getByLabel("Ava R. stopped by this week"),
  ).toHaveCount(0);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const advance = await api.post("/__e2e/time", {
    headers: { "X-E2E-Reset-Key": resetKey },
    data: { now: secondLoungeDay },
  });
  expect(advance.status()).toBe(204);
  const nextDayMasonRest = await api.post(
    "/v1/teams/team-hill-striders/canvas/rest",
    { headers: masonHeaders, data: {} },
  );
  expect(nextDayMasonRest.status()).toBe(204);
  const nextDayRest = await api.post(
    "/v1/teams/team-hill-striders/canvas/rest",
    { headers: avaHeaders, data: {} },
  );
  expect(nextDayRest.status()).toBe(204);
  const nextDayAccess = await api.get(
    "/v1/teams/team-hill-striders/lounge-v2/access",
    { headers: avaHeaders },
  );
  expect(nextDayAccess.status()).toBe(200);
  const priorWeekAccess = await nextDayAccess.json();
  expect(priorWeekAccess).toMatchObject({
    placementCredits: 2,
    placementDay: "2026-08-27",
  });
  await api.dispose();

  await Promise.all([masonPage.reload(), avaPage.reload()]);
  await Promise.all([
    waitForSharedLounge(masonPage),
    waitForSharedLounge(avaPage),
  ]);
  await expect(
    masonPage.getByLabel("Bolt stamp, yours; locked from an earlier day"),
  ).toBeVisible();
  await expect(
    avaPage.getByLabel("Star stamp, yours; locked from an earlier day"),
  ).toBeVisible();
  await expect(
    masonPage.getByRole("button", {
      name: "Bolt stamp, yours; tap then drag to move",
    }),
  ).toHaveCount(0);
  await placeStamp(avaPage, "Soccer ball", { x: 175, y: 210 });
  await expect(
    masonPage.getByLabel("Soccer ball stamp placed by a teammate"),
  ).toBeVisible();
  await expect(
    masonPage.getByLabel("Bolt stamp, yours; locked from an earlier day"),
  ).toBeVisible();

  const nextWeek = await request.newContext({ baseURL: apiBaseURL });
  const advanceWeek = await nextWeek.post("/__e2e/time", {
    headers: { "X-E2E-Reset-Key": resetKey },
    data: { now: nextLoungeWeek },
  });
  expect(advanceWeek.status()).toBe(204);
  for (const headers of [masonHeaders, avaHeaders]) {
    const rest = await nextWeek.post(
      "/v1/teams/team-hill-striders/canvas/rest",
      { headers, data: {} },
    );
    expect(rest.status()).toBe(204);
  }
  const nextWeekAccessResponse = await nextWeek.get(
    "/v1/teams/team-hill-striders/lounge-v2/access",
    { headers: avaHeaders },
  );
  expect(nextWeekAccessResponse.status()).toBe(200);
  const nextWeekAccess = await nextWeekAccessResponse.json();
  expect(nextWeekAccess).toMatchObject({
    placementCredits: 1,
    placementDay: "2026-08-31",
  });
  expect(nextWeekAccess.roomId).not.toBe(priorWeekAccess.roomId);
  expect(nextWeekAccess.placeableStamps).toEqual(
    priorWeekAccess.placeableStamps,
  );
  await nextWeek.dispose();

  await avaPage.reload();
  await waitForSharedLounge(avaPage);
  await expect(avaPage.getByLabel("1 player here")).toBeVisible();
  await expect(avaPage.getByLabel(/stamp, yours; locked/)).toHaveCount(0);
  await expect(avaPage.getByLabel(/stamp placed by a teammate/)).toHaveCount(0);
  await placeStamp(avaPage, "Fire", { x: 210, y: 205 });
  await expect(
    avaPage.getByRole("button", {
      name: "Fire stamp, yours; tap then drag to move",
    }),
  ).toBeVisible();

  await expect(
    masonPage.getByLabel("Bolt stamp, yours; locked from an earlier day"),
  ).toBeVisible();
  await masonPage.reload();
  await waitForSharedLounge(masonPage);
  await expect(masonPage.getByLabel("2 players here")).toBeVisible();
  await expect(masonPage.getByLabel(/stamp, yours; locked/)).toHaveCount(0);
  await expect(
    masonPage.getByLabel("Fire stamp placed by a teammate"),
  ).toBeVisible();

  await avaPage.reload();
  await waitForSharedLounge(avaPage);
  await expect(
    avaPage.getByRole("button", {
      name: "Fire stamp, yours; tap then drag to move",
    }),
  ).toBeVisible();
  await expect(avaPage.getByLabel(/stamp, yours; locked/)).toHaveCount(0);

  await Promise.all([masonContext.close(), avaContext.close()]);
});

test("shared lounge loads the V5 system beach ball art", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
  });
  await enableV2(context);
  const page = await context.newPage();
  await loginAsMason(page);
  const beachBallAsset = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        "/team-lounge-v2/beach-ball.svg",
      ) && response.ok(),
  );

  await openSharedLounge(page);
  await beachBallAsset;
  await expect(sharedLounge(page)).toBeVisible();

  const api = await request.newContext({ baseURL: apiBaseURL });
  const access = await api.get(
    "/v1/teams/team-hill-striders/lounge-v2/access",
    { headers: masonHeaders },
  );
  expect(access.status()).toBe(200);
  const accessBody = await access.json();
  expect(accessBody).toMatchObject({
    roomId: expect.stringMatching(/:v6$/),
  });
  await api.dispose();
  await context.close();
});

test("V2 stamp drags own the touch gesture and repeated trash drops settle cleanly", async ({
  browser,
}) => {
  test.setTimeout(75_000);
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 393, height: 852 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "zoomigo-player-dev-settings-v1",
      JSON.stringify({ teamLoungeVersion: "v2" }),
    );
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const random = seededRandom(26_082_026);

  await loginAsMason(page);
  await page.evaluate(() => {
    window.localStorage.setItem(
      "zoomigo-player-dev-settings-v1",
      JSON.stringify({ teamLoungeVersion: "v2" }),
    );
  });
  await page.goto("/team");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("zoomigo-player-dev-settings-v1"),
      ),
    )
    .toContain('"teamLoungeVersion":"v2"');
  const session = await page.evaluate(() =>
    fetch("/api/auth/session", { cache: "no-store" }).then((response) =>
      response.json(),
    ),
  );
  expect(session).toMatchObject({ developerControlsEnabled: true });
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("V2 · Shared Canvas room")).toBeVisible();
  await expect(page.getByText("The boardwalk could not open.")).toHaveCount(0);

  for (let iteration = 0; iteration < 6; iteration += 1) {
    await page.getByRole("button", { name: "Stamps" }).tap();
    const inventory = page.getByRole("dialog", {
      name: "Choose a stamp to place",
    });
    await expect(inventory).toBeVisible();
    await inventory
      .getByRole("button", { name: /Choose .* stamp/ })
      .first()
      .tap();

    const placementSurface = page.getByRole("button", {
      name: /Place .* in the lounge/,
    });
    await expect(placementSurface).toBeVisible();
    const placementBox = await requiredBox(placementSurface, "placement area");
    await placementSurface.tap({
      position: {
        x: placementBox.width * (0.28 + random() * 0.44),
        y: placementBox.height * (0.25 + random() * 0.4),
      },
    });
    await expect(placementSurface).toHaveCount(0);

    const ownedStamp = page
      .getByRole("button", { name: /stamp, yours; tap then drag to move/ })
      .last();
    await expect(ownedStamp).toBeVisible({ timeout: 5_000 });
    await ownedStamp.tap();
    await expect(ownedStamp).toHaveAttribute("aria-pressed", "true");
    await ownedStamp.scrollIntoViewIfNeeded();
    const editor = page.getByRole("group", { name: "Edit selected stamp" });
    await expect(editor).toBeVisible();
    const selectedStampBox = await requiredBox(ownedStamp, "selected stamp");
    const editorControls = editor.locator('[data-editor-control="true"]');
    await expect(editorControls).toHaveCount(4);
    for (let controlIndex = 0; controlIndex < 4; controlIndex += 1) {
      const controlBox = await requiredBox(
        editorControls.nth(controlIndex),
        `object editor control ${controlIndex + 1}`,
      );
      expect(rectanglesOverlap(selectedStampBox, controlBox)).toBe(false);
    }
    const moreActions = editor.getByRole("button", {
      name: "More stamp actions",
    });
    await moreActions.tap();
    const moreMenu = page.getByRole("menu", { name: "More stamp actions" });
    await expect(moreMenu).toBeVisible();
    const moreMenuBox = await requiredBox(moreMenu, "more actions menu");
    expect(rectanglesOverlap(selectedStampBox, moreMenuBox)).toBe(false);
    await moreActions.tap();
    await expect(moreMenu).toHaveCount(0);
    await editor
      .getByRole("button", { name: "Rotate stamp right 15 degrees" })
      .tap();
    await expect(
      page.getByText("Rotate your stamp in 15 degree steps."),
    ).toHaveCount(0);

    const beforeScroll = await page.evaluate(() => window.scrollY);
    const stampBox = await requiredBox(ownedStamp, "owned stamp");
    const start = center(stampBox);
    const moved = {
      x: start.x + (random() > 0.5 ? 18 : -18),
      y: start.y + 28,
    };
    await touchDrag(cdp, start, moved, 4, random);
    const afterStampMoveScroll = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterStampMoveScroll - beforeScroll)).toBeLessThanOrEqual(
      1,
    );
    await page.waitForTimeout(160);
    await expect(
      page.getByText("Rotate your stamp in 15 degree steps."),
    ).toHaveCount(0);

    const movedStampBox = await requiredBox(ownedStamp, "moved stamp");
    const deleteStart = center(movedStampBox);
    const stampLabel = await ownedStamp.getAttribute("aria-label");
    expect(stampLabel).not.toBeNull();
    await touchStart(cdp, deleteStart);
    await touchMove(cdp, {
      x: deleteStart.x + (random() > 0.5 ? 16 : -16),
      y: deleteStart.y + 24,
    });
    const trash = page.getByLabel("Drop to remove stamp");
    await expect(trash).toBeVisible();
    const trashBox = await requiredBox(trash, "trash target");
    await sleep(8 + Math.floor(random() * 32));
    await touchMove(cdp, center(trashBox));
    await sleep(8 + Math.floor(random() * 32));
    await page.evaluate((label) => {
      const root = document.documentElement;
      root.dataset.stampDeleteTrace = "present";
      let seenAbsent = false;
      const sample = () => {
        const present = [...document.querySelectorAll("button")].some(
          (button) => button.getAttribute("aria-label") === label,
        );
        if (!present) {
          seenAbsent = true;
        } else if (seenAbsent) {
          root.dataset.stampDeleteTrace = "reappeared";
        }
      };
      const observer = new MutationObserver(sample);
      observer.observe(document.body, { childList: true, subtree: true });
      const sampler = window.setInterval(sample, 8);
      window.setTimeout(() => {
        window.clearInterval(sampler);
        observer.disconnect();
        sample();
        if (root.dataset.stampDeleteTrace !== "reappeared" && seenAbsent) {
          root.dataset.stampDeleteTrace = "removed-cleanly";
        }
      }, 900);
    }, stampLabel);
    await touchEnd(cdp);

    await expect(ownedStamp).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.stampDeleteTrace),
      )
      .toBe("removed-cleanly");
    await page.waitForTimeout(1_700 + Math.floor(random() * 450));
    const deleteError = page.getByText(
      "That stamp could not be removed. Try again.",
    );
    if ((await deleteError.count()) > 0) {
      throw new Error(
        `Unexpected delete error: ${await deleteError.getAttribute("data-error-reason")}`,
      );
    }
    await expect(inventory).toHaveCount(0);
  }

  await context.close();
});

interface Point {
  x: number;
  y: number;
}

function center(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function requiredBox(
  locator: {
    boundingBox(): Promise<null | {
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  },
  label: string,
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box;
}

async function touchDrag(
  cdp: { send(method: string, params?: unknown): Promise<unknown> },
  from: Point,
  to: Point,
  steps: number,
  random: () => number,
) {
  await touchStart(cdp, from);
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await sleep(4 + Math.floor(random() * 16));
    await touchMove(cdp, {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
  }
  await touchEnd(cdp);
}

async function touchStart(
  cdp: { send(method: string, params?: unknown): Promise<unknown> },
  point: Point,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1 }],
  });
}

async function touchMove(
  cdp: { send(method: string, params?: unknown): Promise<unknown> },
  point: Point,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...point, id: 1 }],
  });
}

async function touchEnd(cdp: {
  send(method: string, params?: unknown): Promise<unknown>;
}) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function enableV2(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "zoomigo-player-dev-settings-v1",
      JSON.stringify({ teamLoungeVersion: "v2" }),
    );
  });
}

async function openSharedLounge(page: Page) {
  await page.goto("/team");
  await waitForSharedLounge(page);
}

async function waitForSharedLounge(page: Page) {
  await expect(sharedLounge(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("V2 · Shared Canvas room")).toBeVisible();
  await expect(page.getByText("The boardwalk could not open.")).toHaveCount(0);
}

function sharedLounge(page: Page) {
  return page.getByRole("region", { name: "Beach Boardwalk Team Lounge" });
}

async function placeStamp(
  page: Page,
  label: string,
  position: Readonly<{ x: number; y: number }>,
) {
  await page.getByRole("button", { name: "Stamps" }).click();
  const inventory = page.getByRole("dialog", {
    name: "Choose an item to place",
  });
  await expect(inventory).toBeVisible();
  await inventory
    .getByRole("button", { name: `Choose ${label} stamp` })
    .click();
  const placementSurface = page.getByRole("button", {
    name: `Place ${label} in the lounge`,
  });
  await expect(placementSurface).toBeVisible();
  await placementSurface.click({ position });
  try {
    await expect(placementSurface).toHaveCount(0);
  } catch (error) {
    const alerts = await page.getByRole("alert").allTextContents();
    throw new Error(
      `Stamp placement remained open (${alerts.join(" | ") || "no alert"}): ${String(error)}`,
    );
  }
}
