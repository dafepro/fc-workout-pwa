import { expect, test } from "@playwright/test";

test("the avatar demo loads a real GLB into WebGL and drives named animation states", async ({
  page,
}) => {
  const assetResponse = page.waitForResponse((response) =>
    response.url().endsWith("/avatar/reference/zoomigo-reference.glb"),
  );

  await page.goto("/avatar-3d/demo");

  expect((await assetResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("3D avatar ready");
  await expect(page.getByTestId("avatar-3d-canvas")).toBeVisible();
  await expect(page.getByTestId("avatar-animation-state")).toHaveText(
    "Current animation: Idle",
  );

  const webGLVersion = await page
    .getByTestId("avatar-3d-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("webgl2");
      return context?.getParameter(context.VERSION);
    });
  expect(webGLVersion).toContain("WebGL");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("avatar-animation-state")).toHaveText(
    "Current animation: Run",
  );
  await page.getByRole("button", { name: "Celebrate" }).click();
  await expect(page.getByTestId("avatar-animation-state")).toHaveText(
    "Current animation: Celebrate",
  );
});

test("the avatar demo keeps its controls and fallback when the GLB cannot load", async ({
  page,
}) => {
  await page.goto("/avatar-3d/demo?failure=asset");

  await expect(page.getByRole("status")).toHaveText("3D preview unavailable");
  await expect(page.getByLabel("Zoomigo avatar fallback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Walk" })).toBeVisible();
});

test("the avatar demo honors reduced motion without disabling explicit controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/avatar-3d/demo");

  await expect(page.getByText("Reduced motion is on")).toBeVisible();
  await page.getByRole("button", { name: "Walk" }).click();
  await expect(page.getByTestId("avatar-animation-state")).toHaveText(
    "Current animation: Walk",
  );
});

test("the avatar demo stays usable at the 320 pixel product minimum", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/avatar-3d/demo");

  await expect(page.getByRole("status")).toHaveText("3D avatar ready");
  await expect(page.getByRole("button", { name: "Celebrate" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
