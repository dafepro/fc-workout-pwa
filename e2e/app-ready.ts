import type { Page } from "@playwright/test";

export async function openReadyPage(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-app-ready='true']").waitFor();
}
