import { describe, expect, it, vi } from "vitest";

import {
  preserveNativeCanvasScroll,
  relayAvatarPointerDown,
} from "./native-canvas-scroll";

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

  it("relays an avatar pointer claim to Canvas while suppressing native panning", () => {
    const canvas = document.createElement("canvas");
    const received = vi.fn();
    canvas.addEventListener("pointerdown", received);
    const pointer = new PointerEvent("pointerdown", {
      pointerId: 12,
      pointerType: "touch",
      clientX: 30,
      clientY: 40,
      buttons: 1,
      bubbles: true,
      cancelable: true,
    });

    relayAvatarPointerDown(canvas, pointer);

    expect(pointer.defaultPrevented).toBe(true);
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0]?.[0]).toMatchObject({
      pointerId: 12,
      pointerType: "touch",
      clientX: 30,
      clientY: 40,
      buttons: 1,
    });
  });
});
