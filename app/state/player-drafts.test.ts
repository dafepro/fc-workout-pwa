import { beforeEach, describe, expect, it } from "vitest";
import {
  activateDraftOwner,
  clearPlayerDrafts,
  readPlayerDraft,
  writePlayerDraft,
} from "./player-drafts";

const valid = (value: unknown): value is { amount: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { amount?: unknown }).amount === "string";
beforeEach(() => {
  clearPlayerDrafts();
  sessionStorage.clear();
});
describe("private session drafts", () => {
  it("keeps blank answers and separates routes while recovering the same draft", () => {
    activateDraftOwner("player-a/team-a");
    writePlayerDraft("player-a/team-a/log", { amount: "" });
    expect(readPlayerDraft("player-a/team-a/log", valid)).toEqual({
      amount: "",
    });
    expect(readPlayerDraft("player-a/team-a/additional", valid)).toBeNull();
    activateDraftOwner("player-a/team-a");
    expect(readPlayerDraft("player-a/team-a/log", valid)).not.toBeNull();
  });
  it("clears drafts on account change and rejects expired or malformed data", () => {
    activateDraftOwner("player-a/team-a");
    writePlayerDraft("player-a/team-a/log", { amount: "7" });
    activateDraftOwner("player-b/team-a");
    expect(readPlayerDraft("player-a/team-a/log", valid)).toBeNull();
    sessionStorage.setItem(
      "zoomigo-draft:v1:bad",
      '{"expires":0,"value":{"amount":"7"}}',
    );
    expect(readPlayerDraft("bad", valid)).toBeNull();
    sessionStorage.setItem("zoomigo-draft:v1:broken", "not json");
    expect(readPlayerDraft("broken", valid)).toBeNull();
  });
});
