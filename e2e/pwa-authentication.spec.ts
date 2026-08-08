import { expect, request, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

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

test("a player signs in from a QR fragment, stays signed in, and logs out", async ({
  page,
}) => {
  await loginAsMason(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "ZoomiGo home" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Hill Sprints",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Hill Sprints",
    }),
  ).toBeVisible();

  await page.goto("/me");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Scan your QR code to sign in" }),
  ).toBeVisible();
});

// REQ-101 and REQ-102: without a scanned credential there is nothing a child
// could type, so the page offers no PIN box at all -- only help and a quiet
// staff door.
test("landing on the sign-in page without a QR code offers no PIN field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  await page.locator("html[data-app-ready='true']").waitFor();

  await expect(page.locator("input[name='pin']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByText("Ask a parent or coach")).toBeVisible();

  const staffLink = page.getByRole("link", {
    name: "Coaches and staff sign in",
  });
  await expect(staffLink).toHaveCount(1);
  await staffLink.click();
  await expect(
    page.getByRole("heading", { name: "Coach and staff sign in" }),
  ).toBeVisible();
});

// REQ-104: a live session should never be shown a sign-in page again.
test("a signed-in player who reopens the sign-in page is sent home", async ({
  page,
}) => {
  await loginAsMason(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});

test("the PIN field accepts exactly four digits before sending a login", async ({
  page,
}) => {
  await page.goto(
    "/login?e2e=1#credential=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  );
  await page.locator("form[data-credential-ready='true']").waitFor();
  const pin = page.getByLabel("Four-digit PIN");

  await pin.fill("123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("four-digit PIN");

  await pin.fill("24680");
  await expect(pin).toHaveValue("2468");
});
