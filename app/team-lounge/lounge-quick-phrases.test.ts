import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultDevelopmentLoungeChatPackIDs,
  includedLoungeChatPackIDs,
  loungeChatPacks,
  loungeQuickPhrases,
  MAX_ACTIVE_LOUNGE_CHAT_PACKS,
  normalizeLoungeChatPackIDs,
  unlockedLoungeChatPackIDs,
  toggleLoungeChatPack,
} from "./lounge-quick-phrases";

describe("Lounge quick phrases", () => {
  it("offers six reviewed ten-message packs with globally unique IDs", () => {
    expect(loungeChatPacks.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "standard", label: "Standard" },
      { id: "pirate-1", label: "Pirate 1" },
      { id: "gen-alpha", label: "Gen Alpha" },
      { id: "space-cadet", label: "Space Cadet" },
      { id: "sideline", label: "Sideline" },
      { id: "snack-attack", label: "Snack Attack" },
    ]);
    expect(loungeChatPacks.every(({ phrases }) => phrases.length === 10)).toBe(
      true,
    );
    expect(loungeQuickPhrases).toHaveLength(60);
    expect(new Set(loungeQuickPhrases.map(({ id }) => id))).toHaveLength(60);
  });

  it("keeps Standard included while development previews the requested three packs", () => {
    expect(MAX_ACTIVE_LOUNGE_CHAT_PACKS).toBe(3);
    expect(includedLoungeChatPackIDs).toEqual(["standard"]);
    expect(defaultDevelopmentLoungeChatPackIDs).toEqual([
      "standard",
      "pirate-1",
      "gen-alpha",
    ]);
    expect(
      normalizeLoungeChatPackIDs(
        [
          "snack-attack",
          "unknown",
          "snack-attack",
          "space-cadet",
          "sideline",
          "pirate-1",
        ],
        ["standard", "snack-attack", "space-cadet", "sideline"],
      ),
    ).toEqual(["snack-attack", "space-cadet", "sideline"]);
    expect(normalizeLoungeChatPackIDs([], ["standard"])).toEqual(["standard"]);
    expect(normalizeLoungeChatPackIDs("standard", ["standard"])).toEqual(
      includedLoungeChatPackIDs,
    );
  });

  it("derives production packs from Prize Box ownership and unlocks all in development", () => {
    const pirateUnlock = {
      item: {
        id: "lounge-chat-pack-pirate-1",
        kind: "lounge_chat_pack" as const,
        slot: "quick_message_pack",
        assetId: "pirate-1",
        label: "Pirate 1 chat pack",
        catalogVersion: 1,
        rarity: "common" as const,
        destination: "team_lounge" as const,
      },
      source: "daily_check_in" as const,
      unlockedAt: "2026-09-02T12:00:00Z",
    };

    expect(unlockedLoungeChatPackIDs([], false)).toEqual(["standard"]);
    expect(unlockedLoungeChatPackIDs([pirateUnlock], false)).toEqual([
      "standard",
      "pirate-1",
    ]);
    expect(unlockedLoungeChatPackIDs([], true)).toEqual(
      loungeChatPacks.map(({ id }) => id),
    );
  });

  it("allows one to three active packs without silently replacing one", () => {
    expect(
      toggleLoungeChatPack(
        ["standard", "pirate-1", "gen-alpha"],
        "space-cadet",
      ),
    ).toEqual(["standard", "pirate-1", "gen-alpha"]);
    expect(
      toggleLoungeChatPack(["standard", "pirate-1", "gen-alpha"], "pirate-1"),
    ).toEqual(["standard", "gen-alpha"]);
    expect(toggleLoungeChatPack(["standard"], "standard")).toEqual([
      "standard",
    ]);
    expect(toggleLoungeChatPack(["standard"], "space-cadet")).toEqual([
      "standard",
      "space-cadet",
    ]);
  });

  it("keeps every client phrase in the server's closed allowlist", () => {
    const server = readFileSync(
      join(
        process.cwd(),
        "backend",
        "internal",
        "teamlounge",
        "transient_actions.go",
      ),
      "utf8",
    );
    for (const phrase of loungeQuickPhrases) {
      expect(server).toContain(`"${phrase.id}": {}`);
    }
  });
});
