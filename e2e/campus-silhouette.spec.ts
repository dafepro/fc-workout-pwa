import { expect, test } from "@playwright/test";
test("silhouette affects only terrain-hidden pixels and blends overlapping body parts once", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_CAMPUS_REVIEW !== "1",
    "Explicit local visual fixture only",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "http://127.0.0.1:3006/tools/team-world/silhouette-review.html",
  );
  const read = async () =>
    JSON.parse((await page.locator("#result").textContent())!);
  await expect(page.locator("#result")).toContainText("hash");
  const clear = await read();
  await page
    .getByRole("button", { name: "Toggle effect", exact: true })
    .click();
  expect((await read()).hash).toBe(clear.hash);
  await page.getByRole("button", { name: "Move avatar", exact: true }).click();
  const moved = await read();
  await page
    .getByRole("button", { name: "Toggle effect", exact: true })
    .click();
  expect((await read()).hash).toBe(moved.hash);
  await page.getByRole("button", { name: "Covered", exact: true }).click();
  const covered = await read();
  expect(covered.left).toEqual(covered.center);
  expect(covered.right).toEqual(covered.center);
  await page
    .getByRole("button", { name: "Toggle effect", exact: true })
    .click();
  expect((await read()).center).not.toEqual(covered.center);
  await page
    .getByRole("button", { name: "Partial cover", exact: true })
    .click();
  const partial = await read();
  await page
    .getByRole("button", { name: "Toggle effect", exact: true })
    .click();
  const shaded = await read();
  expect(shaded.left).toEqual(partial.left);
  expect(shaded.right).not.toEqual(partial.right);
  expect(errors).toEqual([]);
});
