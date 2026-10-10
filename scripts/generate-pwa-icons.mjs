import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
// Rasterize our existing vector brand mark; no external artwork or fonts.
const svg = await readFile(
  new URL("../public/icons/source.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  for (const [name, size] of [
    ["icon-192", 192],
    ["icon-512", 512],
    ["maskable-512", 512],
    ["apple-touch-icon", 180],
  ]) {
    const png = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#183f34";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size },
    );
    await writeFile(
      new URL(`../public/icons/${name}.png`, import.meta.url),
      Buffer.from(png, "base64"),
    );
  }
} finally {
  await browser.close();
}
