import type { Page } from "@playwright/test";

export async function openReadyPage(page: Page, path: string) {
  await page.goto(path);
  await page
    .waitForURL(/\/login(?:\?.*)?$/, { timeout: 5_000 })
    .catch(() => {});
  if (new URL(page.url()).pathname === "/login") {
    await loginAsMason(page);
    await page.goto(path);
  }
  await page.locator("html[data-app-ready='true']").waitFor();
}

export async function loginAsMason(page: Page) {
  await page.goto(
    "/login?e2e=1#credential=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  );
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.locator("form[data-credential-ready='true']").waitFor();
  await page.getByLabel("Six-digit PIN").fill("246810");
  await page.getByLabel("Remember this device for 30 days").check();
  const signInResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/session") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await signInResponse;
  if (!response.ok()) {
    throw new Error(
      `sign in failed with ${response.status()}: ${await response.text()}`,
    );
  }
  await page.waitForURL(/\/$/);
  await page.locator("html[data-app-ready='true']").waitFor();
}
