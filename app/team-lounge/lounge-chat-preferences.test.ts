import { describe, expect, it } from "vitest";

import {
  loadLoungeChatPackIDs,
  LOUNGE_CHAT_PACK_STORAGE_KEY,
  saveLoungeChatPackIDs,
} from "./lounge-chat-preferences";

describe("Lounge chat pack preferences", () => {
  it("loads only normalized catalog IDs and falls back safely", () => {
    expect(
      loadLoungeChatPackIDs(
        {
          getItem: () =>
            JSON.stringify(["snack-attack", "unknown", "space-cadet"]),
        },
        ["standard", "space-cadet"],
      ),
    ).toEqual(["space-cadet"]);
    expect(
      loadLoungeChatPackIDs(
        {
          getItem: () => "not-json",
        },
        ["standard"],
      ),
    ).toEqual(["standard"]);
  });

  it("stores only the bounded ID array under a versioned device key", () => {
    const written: string[][] = [];
    saveLoungeChatPackIDs(
      {
        setItem: (key, value) => written.push([key, value]),
      },
      ["standard", "space-cadet"],
      ["standard", "space-cadet"],
    );
    expect(written).toEqual([
      [
        LOUNGE_CHAT_PACK_STORAGE_KEY,
        JSON.stringify(["standard", "space-cadet"]),
      ],
    ]);
  });
});
