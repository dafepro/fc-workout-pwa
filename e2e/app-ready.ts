import type { Page, Response } from "@playwright/test";

// The body is gone once the page navigates, and awaiting it then never settles,
// so a failed sign-in reported a 30s timeout instead of its own status. The
// status is the part that explains the failure; the body is a bonus.
async function bodyOrPlaceholder(response: Response): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      response.text().catch(() => "<body unreadable>"),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("<body unavailable>"), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
  await page.getByLabel("Four-digit PIN").fill("2468");
  await page.getByLabel("Remember this device for 30 days").check();
  const signInResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/session") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await signInResponse;
  if (!response.ok()) {
    // The body is gone once the page navigates, and awaiting it then hangs until
    // the test times out — which reports a timeout instead of the status that
    // actually explains the failure. The status is the part worth keeping.
    throw new Error(
      `sign in failed with ${response.status()}: ${await bodyOrPlaceholder(response)}`,
    );
  }
  await page.waitForURL(/\/$/);
  await page.locator("html[data-app-ready='true']").waitFor();
}
