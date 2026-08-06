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
    page.getByRole("heading", { name: "Player sign in" }),
  ).toBeVisible();
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
