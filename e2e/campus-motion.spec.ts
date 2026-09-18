import { test, expect } from "@playwright/test";
test("sprint pose renders consistently across repeated passes", async ({
  page,
}) => {
  test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
  await page.goto("http://127.0.0.1:3006/tools/team-world/motion-review.html");
  await expect(page.locator("#result")).toContainText("ready", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Run sprint comparison" }).click();
  await expect(page.locator("#result")).toContainText("differences");
  const result = JSON.parse((await page.locator("#result").textContent())!);
  await page.screenshot({
    path: "outputs/campus/sprint-motion.png",
    fullPage: true,
  });
  expect(result.differences).toEqual([]);
});

test("kick has a visible strike and follow-through", async ({ page }) => {
  test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
  await page.goto("http://127.0.0.1:3006/tools/team-world/motion-review.html");
  await expect(page.locator("#result")).toContainText("ready", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Review kick", exact: true }).click();
  await expect(page.locator("#result")).toContainText("kick complete");
  await page.screenshot({
    path: "outputs/campus/kick-motion.png",
    fullPage: true,
  });
});
