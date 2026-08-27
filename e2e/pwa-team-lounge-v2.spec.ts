import { expect, request, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
const masonHeaders = { Authorization: "Bearer e2e-player-mason" };

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  const rest = await api.post("/v1/teams/team-hill-striders/canvas/rest", {
    headers: masonHeaders,
    data: {},
  });
  expect(rest.status()).toBe(204);
  await api.dispose();
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
