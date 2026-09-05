import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("reference avatar content", () => {
  it("passes the content hash, rig, attachment, animation, and budget validator", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["tools/avatar-content/validate-reference-library.mjs"],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
