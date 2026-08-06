import { expect, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

test("a new service worker removes the previous app-shell cache", async ({
  page,
}) => {
  await page.goto("/manifest.webmanifest");
  await page.evaluate(async () => {
    const oldCache = await caches.open("legacy-shell-v3");
    await oldCache.put("/team", new Response("outdated team screen"));
  });

  await loginAsMason(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(["zoomigo-shell-v4"]);
});
