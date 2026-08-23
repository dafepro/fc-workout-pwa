import { describe, expect, it } from "vitest";
import { withRuntimeCapabilities } from "./capabilities";

describe("session runtime capabilities", () => {
  it("adds the server-authoritative developer capability", () => {
    expect(withRuntimeCapabilities({ accountId: "account-1" }, true)).toEqual({
      accountId: "account-1",
      developerControlsEnabled: true,
    });
  });

  it("keeps developer controls disabled outside dev", () => {
    expect(withRuntimeCapabilities({ accountId: "account-1" }, false)).toEqual({
      accountId: "account-1",
      developerControlsEnabled: false,
    });
  });
});
