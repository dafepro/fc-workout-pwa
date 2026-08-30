import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";

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

test("a player claims a sealed daily box and opens it on the consolidated page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/");
  await page.getByRole("link", { name: /Prize boxes/i }).click();
  await expect(page).toHaveURL(/\/prizes$/);

  const help = page.getByRole("button", { name: "How Prize Boxes work" });
  await help.click();
  const helpDialog = page.getByRole("dialog", {
    name: "How Prize Boxes work",
  });
  await expect(helpDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close help" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(helpDialog).toHaveCount(0);
  await expect(help).toBeFocused();

  await page.getByRole("button", { name: "Claim sealed box" }).click();
  await expect(
    page.getByRole("button", { name: "Open Daily box, 1 waiting" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Daily box, 1 waiting" }).click();
  const reveal = page.getByRole("dialog");
  await expect(reveal).toBeVisible();
  await expect(reveal.locator("[data-prize-art]")).toBeVisible();
  await expect(reveal.locator("[data-prize-art-missing]")).toHaveCount(0);
  await expect(reveal.locator(".prize-rarity")).toHaveCSS(
    "background-image",
    /linear-gradient/,
  );
  await expect(
    reveal.getByRole("link", { name: /Use in (Avatar|Team Lounge)/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reveal).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toBeFocused();
  await expect(
    page.getByText("Your first opened prize will appear here."),
  ).toHaveCount(0);

  const ownedPrize = page.getByRole("button", { name: /^View / }).first();
  await expect(ownedPrize).toContainText("New");
  await expect(ownedPrize).not.toContainText("From ");
  await ownedPrize.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("link", { name: /Use in (Avatar|Team Lounge)/ }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Close prize detail" }).click();
  await expect(ownedPrize).not.toContainText("New");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "History" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
