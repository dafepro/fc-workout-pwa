import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaStatus } from "./PwaStatus";
import { clearPlayerDrafts, writePlayerDraft } from "../state/player-drafts";

afterEach(() => {
  cleanup();
  clearPlayerDrafts();
  vi.unstubAllGlobals();
});
it("holds an update while drafts exist and only activates on explicit request", async () => {
  const postMessage = vi.fn();
  const worker = { postMessage };
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {
    register: vi.fn().mockResolvedValue({
      waiting: worker,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.stubGlobal("navigator", { onLine: true, serviceWorker });
  writePlayerDraft("player/form", { amount: 7 });
  render(<PwaStatus />);
  const action = await screen.findByRole("button", { name: "Update app" });
  expect(action).toBeDisabled();
  fireEvent.click(action);
  expect(postMessage).not.toHaveBeenCalled();
  act(() => clearPlayerDrafts());
  expect(action).toBeEnabled();
  fireEvent.click(action);
  expect(postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_UPDATE" });
});
it("reports offline state and clears it on reconnection", () => {
  const navigator = { onLine: false };
  vi.stubGlobal("navigator", navigator);
  render(<PwaStatus />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Reconnect before saving",
  );
  navigator.onLine = true;
  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.queryByRole("status")).toBeNull();
});
