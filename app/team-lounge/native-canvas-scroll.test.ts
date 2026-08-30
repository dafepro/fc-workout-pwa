import { describe, expect, it } from "vitest";

import { preserveNativeCanvasScroll } from "./native-canvas-scroll";

describe("native Lounge canvas scrolling", () => {
  it("restores native vertical panning for present and future runtime canvases", async () => {
    const mount = document.createElement("div");
    const presentCanvas = document.createElement("canvas");
    presentCanvas.style.touchAction = "none";
    mount.appendChild(presentCanvas);

    const stop = preserveNativeCanvasScroll(mount);

    expect(presentCanvas.style.touchAction).toBe("pan-y");

    const futureCanvas = document.createElement("canvas");
    futureCanvas.setAttribute("style", "touch-action: none");
    mount.appendChild(futureCanvas);
    await expect.poll(() => futureCanvas.style.touchAction).toBe("pan-y");

    futureCanvas.setAttribute("style", "touch-action: none");
    await expect.poll(() => futureCanvas.style.touchAction).toBe("pan-y");

    stop();
  });
});
