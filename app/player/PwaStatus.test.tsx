import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaStatus } from "./PwaStatus";
import {
  activateDraftOwner,
  clearPlayerDrafts,
  writePlayerDraft,
} from "../state/player-drafts";

afterEach(() => {
  clearPlayerDrafts();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function pendingUpdate() {
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
  return postMessage;
}
it("holds an update while drafts exist and only activates on explicit request", async () => {
  const postMessage = pendingUpdate();
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
it("protects an unopened stored draft after reloading on another route", async () => {
  const postMessage = pendingUpdate();
  sessionStorage.setItem(
    "zoomigo-draft:v1:player/team/log",
    JSON.stringify({ expires: Date.now() + 60_000, value: { amount: "7" } }),
  );
  render(<PwaStatus />);
  const action = await screen.findByRole("button", { name: "Update app" });
  expect(action).toBeDisabled();
  fireEvent.click(action);
  expect(postMessage).not.toHaveBeenCalled();
  act(() => clearPlayerDrafts());
  expect(action).toBeEnabled();
});
it.each([
  "not json",
  "null",
  JSON.stringify({ expires: 0, value: { amount: "7" } }),
  JSON.stringify({ expires: Date.now() + 60_000 }),
  JSON.stringify({ expires: "99999999999999", value: { amount: "7" } }),
])("ignores malformed or expired stored drafts: %s", async (stored) => {
  pendingUpdate();
  sessionStorage.setItem("zoomigo-draft:v1:player/team/log", stored);
  render(<PwaStatus />);
  expect(
    await screen.findByRole("button", { name: "Update app" }),
  ).toBeEnabled();
});
it("clears stored-only drafts when the account changes", async () => {
  pendingUpdate();
  activateDraftOwner("player-a/team");
  sessionStorage.setItem(
    "zoomigo-draft:v1:player-a/team/log",
    JSON.stringify({ expires: Date.now() + 60_000, value: { amount: "7" } }),
  );
  activateDraftOwner("player-b/team");
  render(<PwaStatus />);
  expect(
    await screen.findByRole("button", { name: "Update app" }),
  ).toBeEnabled();
});
it("keeps memory recovery available when storage access is restricted", async () => {
  pendingUpdate();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("restricted storage");
  });
  expect(() => activateDraftOwner("player/team")).not.toThrow();
  writePlayerDraft("player/team/log", { amount: "7" });
  render(<PwaStatus />);
  expect(
    await screen.findByRole("button", { name: "Update app" }),
  ).toBeDisabled();
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
