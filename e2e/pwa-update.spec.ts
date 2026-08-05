import { expect, test } from "@playwright/test";

test("a new service worker removes the previous app-shell cache", async ({
  page,
}) => {
  await page.goto("/manifest.webmanifest");
  await page.evaluate(async () => {
    const oldCache = await caches.open("stridecrew-shell-v1");
    await oldCache.put("/team", new Response("outdated team screen"));
  });

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(["stridecrew-shell-v2"]);
});
