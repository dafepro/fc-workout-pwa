import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("engineering avatar content", () => {
  it("passes the source, skinning, hash, animation, and budget validator", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["tools/avatar-content/validate-engineering-library.mjs"],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
