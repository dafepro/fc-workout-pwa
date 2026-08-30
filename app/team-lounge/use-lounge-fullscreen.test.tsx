import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoungeFullscreen } from "./use-lounge-fullscreen";

let fullscreenElement: Element | null;
let requestFullscreen: ReturnType<typeof vi.fn>;
let exitFullscreen: ReturnType<typeof vi.fn>;
const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "requestFullscreen",
);
const originalExitFullscreen = Object.getOwnPropertyDescriptor(
  document,
  "exitFullscreen",
);
const originalFullscreenElement = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenElement",
);

function Harness() {
  const { active, bindContainer, enter, exit } =
    useLoungeFullscreen<HTMLElement>();
  return (
    <section
      ref={bindContainer}
      data-fullscreen={active || undefined}
      role="region"
      aria-label="Lounge"
    >
      <button type="button" onClick={() => void enter()}>
        Enter full screen
      </button>
      <button type="button" onClick={() => void exit()}>
        Exit full screen
      </button>
    </section>
  );
}

describe("useLoungeFullscreen", () => {
  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreen = vi.fn(async () => {
      fullscreenElement = screen.getByRole("region");
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
  });

  afterEach(() => {
    restoreProperty(
      HTMLElement.prototype,
      "requestFullscreen",
      originalRequestFullscreen,
    );
    restoreProperty(document, "exitFullscreen", originalExitFullscreen);
    restoreProperty(document, "fullscreenElement", originalFullscreenElement);
    document.body.style.overflow = "";
  });

  it("uses native fullscreen and restores page scrolling on exit", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
    await waitFor(() =>
      expect(screen.getByRole("region")).toHaveAttribute(
        "data-fullscreen",
        "true",
      ),
    );
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    await waitFor(() =>
      expect(screen.getByRole("region")).not.toHaveAttribute("data-fullscreen"),
    );
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps a viewport fallback when native fullscreen is refused", async () => {
    requestFullscreen.mockRejectedValueOnce(new Error("not supported"));
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
    await waitFor(() =>
      expect(screen.getByRole("region")).toHaveAttribute(
        "data-fullscreen",
        "true",
      ),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("region")).not.toHaveAttribute("data-fullscreen"),
    );
    expect(exitFullscreen).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
  });
});

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}
