import { expect, test } from "@playwright/test";

const CATALOG_PATH = "/avatar/catalog/avatar-catalog.reference.json";

test("the customizer assembles catalog equipment and drives animation", async ({
  page,
}) => {
  const catalogResponse = page.waitForResponse((response) =>
    response.url().endsWith(CATALOG_PATH),
  );
  await page.goto("/avatar-3d/demo");

  expect((await catalogResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("3D avatar ready");
  await expect(page.getByTestId("avatar-3d-canvas")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Curl Cloud" })).toBeChecked();
  await expect(page.locator("[data-avatar-items]")).toHaveAttribute(
    "data-avatar-items",
    /base\.zoomigo\.reference.*hair\.curl-cloud\.reference.*top\.training-tee\.reference/,
  );

  const contextVersion = await page
    .getByTestId("avatar-3d-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("webgl2");
      return context?.getParameter(context.VERSION);
    });
  expect(contextVersion).toContain("WebGL");

  await page.getByRole("button", { name: "Tops" }).click();
  await page.getByRole("radio", { name: "Touchline Jersey" }).click();
  await expect(page.locator("[data-avatar-items]")).toHaveAttribute(
    "data-avatar-items",
    /top\.touchline-jersey\.reference/,
  );
  await page.getByRole("radio", { name: "Open Sky" }).click();
  await expect(page.getByRole("radio", { name: "Open Sky" })).toBeChecked();

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("avatar-animation-state")).toHaveText(
    "Current animation: Run",
  );
});

test("compatible headwear hides hair without erasing the selection", async ({
  page,
}) => {
  await page.goto("/avatar-3d/demo");
  await expect(page.getByRole("status")).toHaveText("3D avatar ready");

  await page.getByRole("button", { name: "Headwear" }).click();
  await page.getByRole("radio", { name: "Touchline Cap" }).click();

  await expect(
    page.getByText("Your hairstyle is saved and hidden under this item."),
  ).toBeVisible();
  await expect(page.locator("[data-avatar-items]")).toHaveAttribute(
    "data-avatar-items",
    /headwear\.touchline-cap\.reference/,
  );
  await expect(page.locator("[data-avatar-items]")).not.toHaveAttribute(
    "data-avatar-items",
    /hair\./,
  );

  await page.getByRole("radio", { name: "No headwear" }).click();
  await page.getByRole("button", { name: "Hair" }).click();
  await expect(page.getByRole("radio", { name: "Curl Cloud" })).toBeChecked();
});

test("the customizer keeps its controls and fallback when the catalog cannot load", async ({
  page,
}) => {
  await page.goto("/avatar-3d/demo?failure=asset");

  await expect(page.getByRole("status")).toHaveText("3D preview unavailable");
  await expect(page.getByLabel("Zoomigo avatar fallback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tops" })).toBeVisible();
});

test("the customizer honors reduced motion without disabling explicit controls", async ({
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

test("the customizer stays usable at the 320 pixel product minimum", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/avatar-3d/demo");

  await expect(page.getByRole("status")).toHaveText("3D avatar ready");
  await expect(page.getByRole("button", { name: "Headwear" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
