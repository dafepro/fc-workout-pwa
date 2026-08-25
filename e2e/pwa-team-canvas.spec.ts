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
  const reach = await api.post("/v1/me/training-entries", {
    headers: { ...masonHeaders, "Idempotency-Key": "pwa-canvas-reach" },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date().toISOString(),
      result: { kind: "repetitions", value: 10, unit: "reps" },
      effortLevel: 5,
      exhaustionLevel: 4,
    },
  });
  expect(reach.status()).toBe(201);
  const settings = await api.put(
    "/v1/teams/team-hill-striders/canvas/dev-settings",
    {
      headers: masonHeaders,
      data: {
        backgroundAssetId: "soccer-field",
        backgroundColor: "#89C981",
        textColor: "#FFFFFF",
        textSize: 112,
        textStyle: "block",
        stampChoices: [
          "soccer",
          "balloon",
          "rocket",
          "spark-cleat",
          "zoomigo-mark",
        ],
        developerStampLimit: 3,
      },
    },
  );
  expect(settings.ok()).toBe(true);
  await api.dispose();
});

test("connected Team Canvas uses durable pieces, settings, and realtime updates", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const socketURLs: string[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().endsWith("/canvas/socket")) socketURLs.push(socket.url());
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await loginAsMason(page);
  await page.goto("/team-canvas/team");

  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect.poll(() => socketURLs.length).toBe(1);
  await expect(
    page.getByRole("navigation", { name: "Team Canvas" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Mason’s profile" }).click();
  await expect(
    page.getByRole("link", { name: "Customize avatar" }),
  ).toHaveAttribute("href", "/me/avatar");
  await page.getByRole("link", { name: "Team lounge" }).click();
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect(page.getByText("Ari", { exact: true })).toHaveCount(0);
  await expect(page.getByText("4 stamps ready")).toBeVisible();

  const ownAvatar = page.getByRole("button", {
    name: "Move Mason’s avatar",
  });
  const avatarBox = await ownAvatar.boundingBox();
  if (!avatarBox) throw new Error("Current avatar has no bounding box");
  await page.mouse.move(
    avatarBox.x + avatarBox.width / 2,
    avatarBox.y + avatarBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    avatarBox.x + avatarBox.width / 2 + 46,
    avatarBox.y + avatarBox.height / 2 - 10,
    { steps: 4 },
  );
  await page.mouse.up();
  const releasedStyle = await ownAvatar.getAttribute("style");
  await expect
    .poll(() => ownAvatar.getAttribute("style"))
    .not.toBe(releasedStyle);

  const pieceCreated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/canvas/pieces") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Choose Soccer ball stamp" }).click();
  expect((await pieceCreated).ok()).toBe(true);
  await expect(page.getByText("3 stamps ready")).toBeVisible();
  const ownedStamp = page.getByRole("button", {
    name: /Edit .* live stamp/,
  });
  await expect(ownedStamp).toBeVisible();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(1);
  await ownedStamp.click();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(0);
  await ownedStamp.click();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(1);

  const rotationSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/canvas/pieces/") &&
      response.request().method() === "PUT",
  );
  for (let turn = 0; turn < 12; turn += 1) {
    await page.getByRole("button", { name: "Rotate right" }).click();
  }
  await expect(ownedStamp).toHaveAttribute("style", /rotate\(144deg\)/);
  expect((await rotationSaved).ok()).toBe(true);

  await ownedStamp.click();
  const firstAvatarStyle = await ownAvatar.getAttribute("style");
  const api = await request.newContext({ baseURL: apiBaseURL });
  const secondPage = await page.context().newPage();
  secondPage.on("websocket", (socket) => {
    if (socket.url().endsWith("/canvas/socket")) socketURLs.push(socket.url());
  });
  await secondPage.goto("/team-canvas/team");
  await expect(
    secondPage.getByLabel("Hill Striders weekly canvas"),
  ).toBeVisible();
  await expect.poll(() => socketURLs.length).toBe(1);
  const secondAvatar = secondPage.getByRole("button", {
    name: "Move Mason’s avatar",
  });
  const secondAvatarBox = await secondAvatar.boundingBox();
  if (!secondAvatarBox)
    throw new Error("Second tab avatar has no bounding box");
  await secondPage.mouse.move(
    secondAvatarBox.x + secondAvatarBox.width / 2,
    secondAvatarBox.y + secondAvatarBox.height / 2,
  );
  await secondPage.mouse.down();
  await secondPage.mouse.move(
    secondAvatarBox.x + secondAvatarBox.width / 2 + 55,
    secondAvatarBox.y + secondAvatarBox.height / 2,
    { steps: 4 },
  );
  await secondPage.mouse.up();
  await expect
    .poll(() => ownAvatar.getAttribute("style"))
    .not.toBe(firstAvatarStyle);
  await secondPage.close();
  await ownedStamp.click();

  await ownedStamp.hover();
  const stampBox = await ownedStamp.boundingBox();
  if (!stampBox) throw new Error("Owned stamp has no bounding box");
  await page.mouse.down();
  await page.mouse.move(
    stampBox.x + stampBox.width / 2 + 20,
    stampBox.y + stampBox.height / 2 + 20,
  );
  const trash = page.getByLabel("Drop here to delete today’s stamp");
  await expect(trash).toHaveClass(/is-visible/);
  const boardBox = await page.locator(".tc-board").boundingBox();
  if (!boardBox) throw new Error("Team canvas has no bounding box");
  await page.mouse.move(
    boardBox.x + boardBox.width / 2,
    boardBox.y + boardBox.height - 52,
  );
  await expect(trash).toHaveClass(/is-armed/);
  const pieceDeleted = page.waitForResponse(
    (response) =>
      response.url().includes("/canvas/pieces/") &&
      response.request().method() === "DELETE",
  );
  await page.mouse.up();
  expect((await pieceDeleted).status()).toBe(204);
  await expect(page.getByText("4 stamps ready")).toBeVisible();
  await page
    .getByRole("button", { name: /Choose .* stamp/ })
    .last()
    .click();
  await expect(ownedStamp).toBeVisible();

  const toolbox = page.locator(".tc-toolbox");
  await toolbox.getByText("Canvas dev console", { exact: true }).click();
  await toolbox.getByLabel("Background scene").selectOption("cosmic-stadium");
  await toolbox.getByLabel("Team-name style").selectOption("bubble");
  await toolbox.getByLabel("Extra playground stamps").fill("4");
  const settingsSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/canvas/dev-settings") &&
      response.request().method() === "PUT",
  );
  await toolbox.getByRole("button", { name: "Apply to live canvas" }).click();
  expect((await settingsSaved).ok()).toBe(true);
  await expect(page.getByText("4 stamps ready")).toBeVisible();
  await expect(page.locator(".tc-board")).toHaveClass(/tc-board--bubble/);
  await expect(page.locator(".tc-board")).toHaveCSS(
    "background-image",
    /cosmic-stadium\.png/,
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect.poll(() => socketURLs.length).toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await expect(page.locator(".tc-board")).toHaveClass(/tc-board--bubble/);
  await expect(
    page.getByRole("button", { name: /Edit .* live stamp/ }),
  ).toBeVisible();
  await api.dispose();
});
