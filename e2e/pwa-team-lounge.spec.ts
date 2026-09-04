import {
  expect,
  request,
  test,
  type Locator,
  type WebSocketRoute,
} from "@playwright/test";

import { loginAsAva, openReadyPage } from "./app-ready";
import { animatedBorderAvatar } from "./avatar-fixtures";
import {
  loungeNetworkBudget,
  observeLoungeNetwork,
} from "./lounge-network-budget";
import { loungePerformanceBudget } from "./lounge-performance-budget";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

function sampleAvatarXMotion(avatar: Locator, durationMs: number) {
  return avatar.evaluate(
    (node, duration) =>
      new Promise<Array<{ elapsedMs: number; x: number }>>((resolve) => {
        const samples: Array<{ elapsedMs: number; x: number }> = [];
        const startedAt = performance.now();
        const sample = () => {
          const match = node
            .getAttribute("style")
            ?.match(/translate3d\(([-\d.]+)px/u);
          samples.push({
            elapsedMs: performance.now() - startedAt,
            x: Number(match?.[1]),
          });
          if (performance.now() - startedAt >= duration) {
            resolve(samples);
            return;
          }
          requestAnimationFrame(sample);
        };
        sample();
      }),
    durationMs,
  );
}

async function expectArtworkAlphaCentered(artwork: Locator) {
  const measurements = await artwork.evaluateAll(async (nodes) =>
    Promise.all(
      nodes.map(async (node) => {
        const image = node as HTMLImageElement;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D context unavailable");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let minX = canvas.width;
        let maxX = -1;
        let minY = canvas.height;
        let maxY = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (pixels[(y * canvas.width + x) * 4 + 3]! <= 8) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        const artwork = image.closest(".team-lounge__item-art") ?? image;
        const bounds = artwork.getBoundingClientRect();
        const transform = new DOMMatrixReadOnly(
          getComputedStyle(artwork).transform,
        );
        return {
          name: image.alt || new URL(image.src).pathname,
          xPercent:
            (((minX + maxX) / 2 - canvas.width / 2) / canvas.width) * 100 +
            (transform.e / bounds.width) * 100,
          yPercent:
            (((minY + maxY) / 2 - canvas.height / 2) / canvas.height) * 100 +
            (transform.f / bounds.height) * 100,
        };
      }),
    ),
  );
  expect(measurements.length).toBeGreaterThan(0);
  for (const measurement of measurements) {
    expect(
      Math.abs(measurement.xPercent),
      `${measurement.name} horizontal alpha center`,
    ).toBeLessThanOrEqual(3);
    expect(
      Math.abs(measurement.yPercent),
      `${measurement.name} vertical alpha center`,
    ).toBeLessThanOrEqual(3);
  }
}

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
});

test("an interrupted Canvas connection keeps local movement and collisions alive", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let connectionAvailable = true;
  let activeSocket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/v1\/realtime\/rooms\//u, async (socket) => {
    activeSocket = socket;
    if (!connectionAvailable) {
      await socket.close({ code: 1012, reason: "offline regression" });
      return;
    }
    socket.connectToServer();
  });
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-offline-local-physics",
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
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const world = lounge.locator(".team-lounge__world");
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(world).toHaveAttribute("data-canvas-state", "ready");
  const canvasBounds = await stage.locator("canvas").boundingBox();
  expect(canvasBounds).not.toBeNull();

  const dragSelfToWorld = async (x: number, y: number) => {
    const currentX = Number(await stage.getAttribute("data-player-x"));
    const currentY = Number(await stage.getAttribute("data-player-y"));
    await page.mouse.move(
      canvasBounds!.x + canvasBounds!.width * (currentX / 100),
      canvasBounds!.y + canvasBounds!.height * (currentY / 150),
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBounds!.x + canvasBounds!.width * (x / 100),
      canvasBounds!.y + canvasBounds!.height * (y / 150),
      { steps: 24 },
    );
    await page.mouse.up();
  };

  await dragSelfToWorld(45, 98);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-x")))
    .toBeCloseTo(45, 0);
  const startingBallX = Number(await stage.getAttribute("data-ball-x"));
  await stage.evaluate((element, initialBallX) => {
    element.setAttribute("data-e2e-offline-ball-max-x", String(initialBallX));
    new MutationObserver(() => {
      element.setAttribute(
        "data-e2e-offline-ball-max-x",
        String(
          Math.max(
            Number(element.getAttribute("data-e2e-offline-ball-max-x")),
            Number(element.getAttribute("data-ball-x")),
          ),
        ),
      );
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-ball-x"],
    });
  }, startingBallX);

  connectionAvailable = false;
  await activeSocket?.close({ code: 1012, reason: "offline regression" });
  const connectionStatus = lounge.locator(".team-lounge__connection-status");
  await expect(connectionStatus).toContainText(
    "Canvas connection interrupted.",
  );
  await expect(connectionStatus).toContainText(
    "Movement stays local while we reconnect.",
  );
  await expect(connectionStatus).toHaveScreenshot(
    "team-lounge-connection-interrupted.png",
    { animations: "disabled", maxDiffPixels: 50 },
  );
  await expect(world).toHaveAttribute("data-canvas-state", "ready");
  await expect(lounge.getByRole("button", { name: /^Items,/u })).toBeDisabled();

  await dragSelfToWorld(55, 98);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-x")))
    .toBeCloseTo(55, 0);
  await expect
    .poll(async () =>
      Number(await stage.getAttribute("data-e2e-offline-ball-max-x")),
    )
    .toBeGreaterThan(startingBallX + 1);

  connectionAvailable = true;
  await expect(connectionStatus).toHaveCount(0, { timeout: 15_000 });
  await expect(world).toHaveAttribute("data-canvas-state", "ready");
});

test("development exposes the prize props and nearby avatars scatter the pond ducks", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-earned-fun-props",
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
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await lounge.getByRole("button", { name: /^Items,/u }).click();
  for (const label of [
    "Duck pond",
    "Hammock",
    "Robot goalie",
    "Pinball bumper",
  ]) {
    await expect(
      lounge.getByRole("button", { name: `Choose ${label} item` }),
    ).toBeAttached();
  }
  const pickerBumper = lounge
    .getByRole("button", { name: "Choose Pinball bumper item" })
    .locator(".team-lounge__bumper-sprite > i");
  await expect(pickerBumper).toHaveAttribute("data-bumper-sequence", "0");
  expect(
    await pickerBumper.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await expectArtworkAlphaCentered(
    lounge
      .getByRole("dialog", { name: "Choose a Lounge item" })
      .locator(".team-lounge__item-art[src]"),
  );
  await lounge.getByRole("button", { name: /^Stamps,/u }).click();
  await expectArtworkAlphaCentered(
    lounge
      .getByRole("dialog", { name: "Choose a Lounge item" })
      .locator(".team-lounge__item-art[src]"),
  );
  await lounge.getByRole("button", { name: /^Items,/u }).click();

  await lounge.getByRole("button", { name: "Choose Duck pond item" }).click();
  const surface = lounge.getByRole("button", {
    name: "Place Duck pond item on the boardwalk",
  });
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  const placementRequest = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      candidate.url().endsWith("/lounge/placements"),
  );
  await surface.click({
    position: { x: bounds!.width * 0.43, y: bounds!.height * (92 / 150) },
  });
  expect((await placementRequest).postDataJSON()).toMatchObject({
    definitionId: "zoomigo-prop-play-duck-pond",
    definitionVersion: 5,
  });
  await expect(lounge.getByRole("status")).toHaveText("Duck pond placed.", {
    timeout: 10_000,
  });

  const pond = lounge.getByRole("button", {
    name: "Duck pond item, yours; tap to edit",
  });
  await expectArtworkAlphaCentered(
    pond.locator(".team-lounge__duck-pond-base"),
  );
  await expect(pond.locator("[data-duck]")).toHaveCount(3);
  await expect
    .poll(
      () =>
        pond.locator(".team-lounge__duck-pond").evaluate((node) => {
          const style = (node as HTMLElement).style;
          return (
            Math.abs(Number(style.getPropertyValue("--duck-flee-x"))) +
            Math.abs(Number(style.getPropertyValue("--duck-flee-y")))
          );
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.05);
  await pond.click();
  const editablePond = lounge.getByRole("button", {
    name: "Duck pond item, yours; drag to move",
  });
  const editor = lounge.getByRole("group", { name: "Edit selected item" });
  const centerError = await Promise.all([
    editablePond.boundingBox(),
    editor.locator(".team-lounge__item-editor-ring").boundingBox(),
  ]).then(([itemBounds, editorBounds]) => {
    expect(itemBounds).not.toBeNull();
    expect(editorBounds).not.toBeNull();
    return Math.hypot(
      itemBounds!.x +
        itemBounds!.width / 2 -
        (editorBounds!.x + editorBounds!.width / 2),
      itemBounds!.y +
        itemBounds!.height / 2 -
        (editorBounds!.y + editorBounds!.height / 2),
    );
  });
  expect(centerError).toBeLessThanOrEqual(0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("the Lounge clips and animates the configured avatar at the reduced size", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-avatar-presentation",
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
  const avatar = await api.put("/v1/me/avatar", {
    headers: { Authorization: "Bearer e2e-player-mason" },
    data: { configuration: animatedBorderAvatar },
  });
  expect(avatar.status()).toBe(200);
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  const currentAvatar = lounge.locator(
    ".team-lounge__shared-avatar[data-current='true']",
  );
  const decoration = currentAvatar.locator(".team-lounge__avatar-decoration");
  await expect(decoration).toBeVisible();
  await expect(decoration.locator(".avatar-effect--animated")).toBeVisible();
  await expect(decoration.locator(".avatar-border--running")).toBeVisible();

  const metrics = await decoration.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const canvas = node
      .closest(".team-lounge__playfield")
      ?.querySelector("canvas")
      ?.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      width: bounds.width,
      expectedWidth: (canvas?.width ?? 0) * 0.135,
      overflow: style.overflow,
      borderRadius: style.borderRadius,
      animationCount: node.getAnimations({ subtree: true }).length,
    };
  });
  expect(metrics.width).toBeCloseTo(metrics.expectedWidth, 0);
  expect(metrics.width).toBeGreaterThan(35);
  expect(metrics.overflow).toBe("hidden");
  expect(metrics.borderRadius).toBe("50%");
  expect(metrics.animationCount).toBeGreaterThanOrEqual(2);

  const runner = decoration.locator(".avatar-border__runner--primary");
  const firstTime = await runner.evaluate(
    (node) => node.getAnimations()[0]?.currentTime ?? 0,
  );
  await page.waitForTimeout(150);
  const secondTime = await runner.evaluate(
    (node) => node.getAnimations()[0]?.currentTime ?? 0,
  );
  expect(Number(secondTime)).toBeGreaterThan(Number(firstTime));

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await expect(stage.locator("canvas")).toBeVisible();
});

test("overlapping avatars remain atomic with the local player always on top", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const player of ["mason", "ava"]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `browser-lounge-avatar-overlap-${player}`,
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
  for (const [player, head] of [
    ["mason", "prism-dragon"],
    ["ava", "cheetah"],
  ] as const) {
    const avatar = await api.put("/v1/me/avatar", {
      headers: { Authorization: `Bearer e2e-player-${player}` },
      data: { configuration: { ...animatedBorderAvatar, head } },
    });
    expect(avatar.status()).toBe(200);
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
    await openReadyPage(page, "/team?view=lounge");
    await loginAsAva(avaPage);
    await avaPage.goto("/team?view=lounge");
    await avaPage.locator("html[data-app-ready='true']").waitFor();

    const lounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(lounge.getByText("2 here")).toBeVisible({ timeout: 15_000 });
    const local = lounge.locator(
      ".team-lounge__shared-avatar[data-current='true']",
    );
    const teammate = lounge.locator(
      ".team-lounge__shared-avatar[data-presence='active']",
    );
    await expect(
      local.locator(".team-lounge__avatar-decoration"),
    ).toBeVisible();
    await expect(
      teammate.locator(".team-lounge__avatar-decoration"),
    ).toBeVisible();
    await expect(local.locator(".avatar-art")).toHaveCount(1);
    await expect(teammate.locator(".avatar-art")).toHaveCount(1);
    await expect(local.locator(".avatar-art__layer--background")).toBeVisible();
    await expect(local.locator(".avatar-art__layer--head")).toBeVisible();
    await expect(local.locator(".avatar-art__layer--kit")).toBeVisible();
    await expect(local.locator(".avatar-effect--animated")).toBeVisible();
    await expect(teammate.locator(".avatar-effect--animated")).toBeVisible();

    const layering = await lounge.evaluate((root) => {
      const current = root.querySelector<HTMLElement>(
        ".team-lounge__shared-avatar[data-current='true']",
      );
      const peer = root.querySelector<HTMLElement>(
        ".team-lounge__shared-avatar[data-presence='active']",
      );
      const canvas = root.querySelector("canvas");
      if (!current || !peer || !canvas) return null;
      const currentBounds = current
        .querySelector(".team-lounge__avatar-decoration")
        ?.getBoundingClientRect();
      const peerBounds = peer
        .querySelector(".team-lounge__avatar-decoration")
        ?.getBoundingClientRect();
      const canvasBounds = canvas.getBoundingClientRect();
      if (!currentBounds || !peerBounds) return null;
      const overlapWidth = Math.max(
        0,
        Math.min(currentBounds.right, peerBounds.right) -
          Math.max(currentBounds.left, peerBounds.left),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(currentBounds.bottom, peerBounds.bottom) -
          Math.max(currentBounds.top, peerBounds.top),
      );
      return {
        currentZ: Number(getComputedStyle(current).zIndex),
        peerZ: Number(getComputedStyle(peer).zIndex),
        currentWidth: currentBounds.width,
        expectedWidth: canvasBounds.width * 0.135,
        overlapArea: overlapWidth * overlapHeight,
        avatarArea: currentBounds.width * currentBounds.height,
      };
    });
    expect(layering).not.toBeNull();
    expect(layering!.currentZ).toBeGreaterThan(layering!.peerZ);
    expect(layering!.currentWidth).toBeCloseTo(layering!.expectedWidth, 0);
    expect(layering!.overlapArea / layering!.avatarArea).toBeGreaterThan(0.5);
  } finally {
    await avaContext.close();
  }
});

test("a completed offline teammate rests on the bench with a drained, paused avatar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const player of ["mason", "ava"]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `browser-lounge-bench-${player}`,
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
  const avatar = await api.put("/v1/me/avatar", {
    headers: { Authorization: "Bearer e2e-player-ava" },
    data: {
      configuration: {
        ...animatedBorderAvatar,
        head: "cheetah",
      },
    },
  });
  expect(avatar.status()).toBe(200);
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await expect(lounge.getByText("1 here")).toBeVisible();
  const benchAvatar = lounge.getByRole("img", {
    name: "Ava R., finished and resting on the bench",
  });
  await expect(benchAvatar).toBeVisible();
  await expect(benchAvatar).toHaveAttribute("data-presence", "bench");
  await expect(benchAvatar.locator("span")).toHaveText("✓");
  const presentation = await benchAvatar
    .locator(".team-lounge__avatar-decoration--bench")
    .evaluate((node) => ({
      filter: getComputedStyle(node).filter,
      animationStates: node
        .getAnimations({ subtree: true })
        .map((animation) => animation.playState),
      hasConfiguredEffect: Boolean(
        node.querySelector(".avatar-effect--animated"),
      ),
    }));
  expect(presentation.filter).toContain("grayscale");
  expect(presentation.filter).toContain("saturate");
  expect(presentation.hasConfiguredEffect).toBe(true);
  expect(presentation.animationStates.length).toBeGreaterThan(0);
  expect(
    presentation.animationStates.every((state) => state === "paused"),
  ).toBe(true);
  const benchLayer = await benchAvatar.evaluate((node) =>
    Number(getComputedStyle(node).zIndex),
  );
  const objectLayers = await lounge
    .locator(".team-lounge__placed-item")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(getComputedStyle(node).zIndex)),
    );
  expect(objectLayers.length).toBeGreaterThan(0);
  expect(objectLayers.every((layer) => layer > benchLayer)).toBe(true);
});

test("a placed stamp keeps the exact artwork promised by the picker", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-stamp-parity",
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
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await lounge.getByRole("button", { name: "Stamps" }).click();
  const soccerStampChoice = lounge.getByRole("button", {
    name: "Choose Soccer ball stamp",
  });
  const promised = await soccerStampChoice
    .locator(".team-lounge__item-art--stamp")
    .evaluate((node) => ({
      filter: getComputedStyle(node).filter,
      text: node.textContent,
    }));
  await soccerStampChoice.click();
  await lounge
    .getByRole("button", {
      name: "Place Soccer ball stamp on the boardwalk",
    })
    .click({ position: { x: 90, y: 140 } });
  await expect(lounge.getByRole("status")).toHaveText("Soccer ball placed.", {
    timeout: 10_000,
  });
  const placed = lounge
    .getByRole("button", {
      name: "Soccer ball stamp, yours; tap to edit",
    })
    .locator(".team-lounge__item-art--stamp");
  await expect(placed).toBeVisible();
  await expect
    .poll(() =>
      placed.evaluate((node) => ({
        filter: getComputedStyle(node).filter,
        text: node.textContent,
      })),
    )
    .toEqual(promised);
});

test("the consolidated Team view opens the canonical canvas Lounge at 320 pixels", async ({
  page,
}) => {
  test.setTimeout(90_000);
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
  await openReadyPage(page, "/team?view=lounge");

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
  await expect(lounge.getByLabel("Mason C., you")).toHaveCount(1);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-y")))
    .toBeGreaterThanOrEqual(0);
  expect(Number(await stage.getAttribute("data-player-y"))).toBeLessThanOrEqual(
    150,
  );
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
    const currentX = Number(await stage.getAttribute("data-player-x"));
    const currentY = Number(await stage.getAttribute("data-player-y"));
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width * (currentX / 100),
      canvasBox!.y + canvasBox!.height * (currentY / 150),
    );
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
  ).toBeLessThanOrEqual(96.1);

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

  await page.evaluate(() => window.scrollTo(0, 0));
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
  const settingsWheel = lounge.getByRole("button", {
    name: "Quick-message pack settings",
  });
  await expect(
    lounge
      .locator(".team-lounge__header")
      .getByRole("button", { name: "Quick-message pack settings" }),
  ).toHaveCount(1);
  await expect(
    lounge
      .locator(".team-lounge__world")
      .getByRole("button", { name: "Quick-message pack settings" }),
  ).toHaveCount(0);
  const settingsWheelBox = await settingsWheel.boundingBox();
  const loungeHeaderBox = await lounge
    .locator(".team-lounge__header")
    .boundingBox();
  const loungeWorldBox = await lounge
    .locator(".team-lounge__world")
    .boundingBox();
  expect(settingsWheelBox?.width).toBeGreaterThanOrEqual(44);
  expect(settingsWheelBox?.height).toBeGreaterThanOrEqual(44);
  expect(settingsWheelBox!.x).toBeGreaterThanOrEqual(loungeHeaderBox!.x);
  expect(settingsWheelBox!.x + settingsWheelBox!.width).toBeLessThanOrEqual(
    loungeHeaderBox!.x + loungeHeaderBox!.width,
  );
  expect(settingsWheelBox!.y + settingsWheelBox!.height).toBeLessThanOrEqual(
    loungeWorldBox!.y,
  );
  await settingsWheel.click();
  const chatSettings = lounge.getByRole("dialog", {
    name: "Choose chat packs",
  });
  await expect(chatSettings).toBeVisible();
  await expect(chatSettings.getByText("3 of 3 selected")).toBeVisible();
  await expect(chatSettings.getByLabel("Locked Prize Box reward")).toHaveCount(
    0,
  );
  await expect(
    chatSettings.getByRole("checkbox", { name: /Space Cadet/u }),
  ).toBeDisabled();
  await chatSettings.getByRole("checkbox", { name: /Pirate 1/u }).uncheck();
  await chatSettings.getByRole("checkbox", { name: /Space Cadet/u }).check();
  await chatSettings
    .getByRole("button", { name: "Close chat settings" })
    .click();
  await lounge.getByRole("button", { name: "Chat" }).click();
  const chatSets = lounge.getByRole("dialog", { name: "Choose a chat set" });
  await expect(chatSets).toHaveAttribute("data-anchor", "chat");
  await expect(lounge.getByRole("button", { name: "Pirate 1" })).toHaveCount(0);
  await lounge.getByRole("button", { name: "Space Cadet" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a Space Cadet message" }),
  ).toBeVisible();
  await expect(
    lounge.getByRole("button", { name: / quick message$/u }),
  ).toHaveCount(10);
  const spaceQuickMessage = lounge.getByRole("button", {
    name: "Send Blast off! quick message",
  });
  await expect(spaceQuickMessage).toBeEnabled({ timeout: 3_000 });
  await spaceQuickMessage.click();
  await expect(lounge.getByRole("status").last()).toHaveText(
    "Blast off! sent.",
  );
  await expect(lounge.locator(".team-lounge__avatar-phrase")).toHaveText(
    "Blast off!",
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
  const phraseStampChoice = lounge.getByRole("button", {
    name: "Choose Certified silly goose stamp",
  });
  const promisedStampStyle = await phraseStampChoice
    .locator(".team-lounge__item-art--stamp")
    .evaluate((node) => ({
      filter: getComputedStyle(node).filter,
      text: node.textContent,
    }));
  await expect(phraseStampChoice.locator("img")).toHaveAttribute(
    "src",
    "/team-lounge/stamps/silly-goose-v1.svg",
  );
  await phraseStampChoice.click();
  const placementSurface = lounge.getByRole("button", {
    name: "Place Certified silly goose stamp on the boardwalk",
  });
  await placementSurface.click({ position: { x: 90, y: 140 } });
  await expect(lounge.getByRole("status")).toHaveText(
    "Certified silly goose placed.",
    { timeout: 10_000 },
  );
  const editableStamp = lounge.locator(".team-lounge__placed-item--editable");
  await expect(editableStamp).toBeVisible({ timeout: 10_000 });
  await expect(editableStamp).toHaveAccessibleName(
    "Certified silly goose stamp, yours; tap to edit",
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
  expect(stampBox).not.toBeNull();
  const placedStampArt = editableStamp.locator(".team-lounge__item-art--stamp");
  await expect(placedStampArt).toHaveCount(1);
  await expect
    .poll(() =>
      placedStampArt.evaluate((node) => ({
        filter: getComputedStyle(node).filter,
        text: node.textContent,
      })),
    )
    .toEqual(promisedStampStyle);
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
    "Certified silly goose stamp, yours; tap to edit",
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
    "Certified silly goose stamp, yours; drag to move",
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
  const holdEditorControl = async (control: Locator) => {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
  };
  const largerControl = lounge.getByRole("button", {
    name: "Make stamp larger",
  });
  const transformBeforeHold = await editableStamp.evaluate(
    (node) => getComputedStyle(node).transform,
  );
  await holdEditorControl(largerControl);
  await expect
    .poll(() =>
      editableStamp.evaluate((node) => getComputedStyle(node).transform),
    )
    .not.toBe(transformBeforeHold);
  await holdEditorControl(
    lounge.getByRole("button", { name: "Rotate stamp right 15 degrees" }),
  );
  await expect(editableStamp).toBeEnabled();
  await expect
    .poll(() => network.current().permitKinds, { timeout: 10_000 })
    .toEqual(["scale", "rotation"]);
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
  await expect(lounge.getByRole("status")).toHaveText(
    "Certified silly goose updated.",
    { timeout: 10_000 },
  );
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
  await expect(lounge.getByRole("status")).toHaveText(
    "Certified silly goose removed.",
    { timeout: 10_000 },
  );
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

test("the ball cannon visibly fuses before its high-speed launch and the avatar crosses through the goal", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const dayOffset of [0, 1]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: "Bearer e2e-player-mason",
        "Idempotency-Key": `browser-lounge-cannon-qualification-${dayOffset}`,
      },
      data: {
        teamId: "team-hill-striders",
        activityDefinitionId: "hill-sprints",
        assignmentId: "assignment-hill-sprints",
        occurredAt: new Date(
          Date.now() - dayOffset * 24 * 60 * 60 * 1_000 - 60_000,
        ).toISOString(),
        result: { kind: "repetitions", value: 8, unit: "reps" },
        effortLevel: 4,
        exhaustionLevel: 3,
        completionOutcome: "as_listed",
      },
    });
    expect(completion.status()).toBe(201);
  }
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await expect(stage.locator("canvas")).toBeVisible();

  const place = async (label: string, x: number, y: number) => {
    await lounge.getByRole("button", { name: /^Items,/u }).click();
    const choice = lounge.getByRole("button", {
      name: `Choose ${label} item`,
    });
    await expect(choice).toBeVisible();
    await choice.click();
    const surface = lounge.getByRole("button", {
      name: `Place ${label} item on the boardwalk`,
    });
    const bounds = await surface.boundingBox();
    expect(bounds).not.toBeNull();
    await surface.click({
      position: {
        x: bounds!.width * (x / 100),
        y: bounds!.height * (y / 150),
      },
    });
    await expect(lounge.getByRole("status")).toHaveText(`${label} placed.`, {
      timeout: 10_000,
    });
    const item = lounge.getByRole("button", {
      name: `${label} item, yours; tap to edit`,
    });
    await expect(item).toBeVisible({ timeout: 10_000 });
    return item;
  };

  await place("Mini goal", 58, 80);
  const cannon = await place("Ball cannon", 77, 98);

  await stage.evaluate((element) => {
    let previous = Number(element.getAttribute("data-ball-x"));
    element.setAttribute("data-e2e-ball-max-step", "0");
    new MutationObserver(() => {
      const current = Number(element.getAttribute("data-ball-x"));
      const previousMaximum = Number(
        element.getAttribute("data-e2e-ball-max-step"),
      );
      element.setAttribute(
        "data-e2e-ball-max-step",
        String(Math.max(previousMaximum, Math.abs(current - previous))),
      );
      previous = current;
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-ball-x"],
    });
  });

  const canvas = stage.locator("canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const maxArrivalError = 3;
  const dragSelfToWorld = async (x: number, y: number) => {
    const currentX = Number(await stage.getAttribute("data-player-x"));
    const currentY = Number(await stage.getAttribute("data-player-y"));
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width * (currentX / 100),
      canvasBox!.y + canvasBox!.height * (currentY / 150),
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width * (x / 100),
      canvasBox!.y + canvasBox!.height * (y / 150),
      { steps: 24 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Math.abs(Number(await stage.getAttribute("data-player-x")) - x),
      )
      .toBeLessThan(maxArrivalError);
    await expect
      .poll(async () =>
        Math.abs(Number(await stage.getAttribute("data-player-y")) - y),
      )
      .toBeLessThan(maxArrivalError);
  };

  await dragSelfToWorld(48, 98);
  await dragSelfToWorld(59, 98);
  await expect(cannon).toHaveAttribute("data-cannon-fuse", "true");
  expect(Number(await stage.getAttribute("data-ball-x"))).toBeLessThan(84);
  await page.waitForTimeout(250);
  await expect(cannon).toHaveAttribute("data-cannon-fuse", "true");
  expect(Number(await stage.getAttribute("data-ball-x"))).toBeLessThan(84);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-ball-x")), {
      timeout: 10_000,
    })
    .toBeGreaterThan(86);
  await expect
    .poll(async () =>
      Number(await stage.getAttribute("data-e2e-ball-max-step")),
    )
    .toBeGreaterThan(10);

  await dragSelfToWorld(40, 80);
  await dragSelfToWorld(76, 80);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-player-x")))
    .toBeGreaterThan(72);
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
    await page.goto("/team?view=lounge");
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
      ".team-lounge__shared-avatar[data-current='true']",
    );
    await expect(currentAvatar.getByText("You")).toBeVisible();
    await expect(currentAvatar.locator(".avatar")).toHaveCount(0);
    const avatarHandle = currentAvatar.getByRole("button", {
      name: "Ava R., you",
    });
    await expect(avatarHandle).toBeVisible();
    await expect
      .poll(() =>
        avatarHandle.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return {
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            touchAction: getComputedStyle(node).touchAction,
          };
        }),
      )
      .toEqual({ width: 88, height: 88, touchAction: "none" });
    await expect
      .poll(() =>
        stage.locator("canvas").evaluate((node) => ({
          pointerEvents: getComputedStyle(node).pointerEvents,
          touchAction: getComputedStyle(node).touchAction,
        })),
      )
      .toEqual({ pointerEvents: "auto", touchAction: "pan-y" });

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
    const playerBox = await avatarHandle.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(playerBox).not.toBeNull();
    const destinationX = 35;
    const origin = {
      // Start outside the visible sprite but within its thumb-sized handle.
      x: playerBox!.x + playerBox!.width * 0.8,
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
      .poll(async () =>
        Math.abs(
          Number(await stage.getAttribute("data-player-x")) - destinationX,
        ),
      )
      .toBeLessThan(1.5);
    await expect
      .poll(async () =>
        Math.abs(Number(await stage.getAttribute("data-player-y")) - 85),
      )
      .toBeLessThan(1.5);
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
  await page.goto("/team?view=lounge");
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
            definitionVersion: 3,
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
    await secondPage.goto("/team?view=lounge");
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
  await page.goto("/team?view=lounge");
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
    await secondPage.goto("/team?view=lounge");
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
      firstLounge.getByRole("button", { name: "Reconnect canvas" }),
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
    await openReadyPage(page, "/team?view=lounge");
    await loginAsAva(avaPage);
    await avaPage.goto("/team?view=lounge");
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
    await expect(masonLounge.getByLabel("Ava R.")).toHaveCount(1);
    await expect(avaLounge.getByLabel("Mason C.")).toHaveCount(1);
    await expect(masonLounge.getByText("Ava", { exact: true })).toBeVisible();
    await expect(avaLounge.getByText("Mason", { exact: true })).toBeVisible();

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
    await expect(ownedConeArtwork).toHaveAttribute(
      "src",
      "/team-lounge/items/wobble-cone-v1.png",
    );
    const avaStage = avaLounge.getByLabel("Interactive lounge canvas");
    const teammateCone = avaLounge.getByLabel(
      "Wobble cone item placed by a teammate",
    );
    await expect(teammateCone).toBeVisible({ timeout: 10_000 });
    await expect(teammateCone.locator("img")).toHaveAttribute(
      "src",
      "/team-lounge/items/wobble-cone-v1.png",
    );
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
    const overlayX = (overlay: typeof masonOnAvaPage) =>
      overlay.evaluate((node) => {
        const match = node
          .getAttribute("style")
          ?.match(/translate3d\(([-\d.]+)px/u);
        return Number(match?.[1]);
      });
    const startRemoteX = await overlayX(masonOnAvaPage);

    const remoteMotion = sampleAvatarXMotion(masonOnAvaPage, 1_400);

    await page.mouse.move(
      masonCanvasBox!.x + masonCanvasBox!.width * (startWorldX / 100),
      masonCanvasBox!.y + masonCanvasBox!.height * (startWorldY / 150),
    );
    await page.mouse.down();
    for (let step = 1; step <= 30; step += 1) {
      const progress = step / 30;
      await page.mouse.move(
        masonCanvasBox!.x +
          masonCanvasBox!.width *
            ((startWorldX + (targetWorldX - startWorldX) * progress) / 100),
        masonCanvasBox!.y + masonCanvasBox!.height * (startWorldY / 150),
      );
      await page.waitForTimeout(30);
    }
    await page.mouse.up();

    const remoteSamples = await remoteMotion;
    const remoteChanges = remoteSamples.filter(
      (sample, index) =>
        index > 0 && Math.abs(sample.x - remoteSamples[index - 1]!.x) >= 0.05,
    );
    const longestRemoteFreeze = Math.max(
      0,
      ...remoteChanges
        .slice(1)
        .map(
          (sample, index) => sample.elapsedMs - remoteChanges[index]!.elapsedMs,
        ),
    );
    expect(longestRemoteFreeze).toBeLessThan(200);
    expect(remoteChanges.length).toBeGreaterThanOrEqual(20);

    await expect
      .poll(async () =>
        Math.abs(
          Number(await masonStage.getAttribute("data-player-x")) - targetWorldX,
        ),
      )
      .toBeLessThan(1.5);

    await expect
      .poll(async () =>
        Math.abs((await overlayX(masonOnAvaPage)) - startRemoteX),
      )
      .toBeGreaterThan(3);

    await expect
      .poll(async () => Number(await avaStage.getAttribute("data-ball-x")))
      .toBeGreaterThan(0);

    const avaSelf = avaLounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "You" });
    const avaCanvas = avaStage.locator("canvas");
    const avaCanvasBox = await avaCanvas.boundingBox();
    expect(avaCanvasBox).not.toBeNull();
    const avaStartWorldX = Number(await avaStage.getAttribute("data-player-x"));
    const avaStartWorldY = Number(await avaStage.getAttribute("data-player-y"));
    const avaTargetWorldX = Math.min(80, avaStartWorldX + 15);
    const avaLocalMotion = sampleAvatarXMotion(avaSelf, 1_000);

    await avaPage.mouse.move(
      avaCanvasBox!.x + avaCanvasBox!.width * (avaStartWorldX / 100),
      avaCanvasBox!.y + avaCanvasBox!.height * (avaStartWorldY / 150),
    );
    await avaPage.mouse.down();
    for (let step = 1; step <= 30; step += 1) {
      const progress = step / 30;
      await avaPage.mouse.move(
        avaCanvasBox!.x +
          avaCanvasBox!.width *
            ((avaStartWorldX + (avaTargetWorldX - avaStartWorldX) * progress) /
              100),
        avaCanvasBox!.y + avaCanvasBox!.height * (avaStartWorldY / 150),
      );
      await avaPage.waitForTimeout(30);
    }
    await avaPage.mouse.up();

    const avaLocalSamples = await avaLocalMotion;
    const activePeerSamples = avaLocalSamples.filter(
      ({ elapsedMs }) => elapsedMs >= 100 && elapsedMs <= 900,
    );
    const activePeerSteps = activePeerSamples
      .slice(1)
      .map((sample, index) => sample.x - activePeerSamples[index]!.x);
    const peerMotionSummary = JSON.stringify({
      samples: activePeerSamples.length,
      distance: activePeerSamples.at(-1)!.x - activePeerSamples[0]!.x,
      slowestStep: Math.min(...activePeerSteps),
      fastestStep: Math.max(...activePeerSteps),
    });
    expect(activePeerSamples.length, peerMotionSummary).toBeGreaterThanOrEqual(
      40,
    );
    expect(
      activePeerSamples.at(-1)!.x - activePeerSamples[0]!.x,
      peerMotionSummary,
    ).toBeGreaterThan(6);
    expect(Math.min(...activePeerSteps), peerMotionSummary).toBeGreaterThan(
      -0.08,
    );
    expect(Math.max(...activePeerSteps), peerMotionSummary).toBeLessThan(2.25);

    const dragMasonToWorld = async (x: number, y: number) => {
      const currentX = Number(await masonStage.getAttribute("data-player-x"));
      const currentY = Number(await masonStage.getAttribute("data-player-y"));
      await page.mouse.move(
        masonCanvasBox!.x + masonCanvasBox!.width * (currentX / 100),
        masonCanvasBox!.y + masonCanvasBox!.height * (currentY / 150),
      );
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

  await openReadyPage(page, "/team?view=lounge");
  const currentAvatar = page
    .locator(".team-lounge__shared-avatar")
    .filter({ hasText: "You" });
  await expect(currentAvatar.getByText("You")).toBeVisible({
    timeout: 15_000,
  });
  await expect(currentAvatar.locator(".avatar")).toHaveCount(0);

  await page.goto("/me");
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.waitForTimeout(4_000);

  const avaContext = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
  });
  const avaPage = await avaContext.newPage();
  try {
    await loginAsAva(avaPage);
    await avaPage.goto("/team?view=lounge");
    await avaPage.locator("html[data-app-ready='true']").waitFor();
    await expect(avaPage.getByLabel("Mason visited this week")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/team?view=lounge");
    await page.locator("html[data-app-ready='true']").waitFor();
    const stage = page.getByLabel("Interactive lounge canvas");
    await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(currentAvatar.getByText("You")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () => Number(await stage.getAttribute("data-player-x")))
      .toBeGreaterThan(0);

    await page.keyboard.press("p");
    await page.waitForTimeout(1_500);
    await expect(currentAvatar.getByText("You")).toBeVisible();

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
