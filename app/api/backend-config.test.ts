import { describe, expect, it } from "vitest";
import { resolveBackendBaseURL } from "./backend-config";

describe("resolveBackendBaseURL", () => {
  it("normalizes the ZoomiGo production binding", () => {
    expect(resolveBackendBaseURL("https://api.quicktrack.cc/")).toBe(
      "https://api.quicktrack.cc",
    );
  });

  it("requires HTTPS except for the private Docker API hostname", () => {
    expect(resolveBackendBaseURL("http://api:8080")).toBe("http://api:8080");
    expect(() => resolveBackendBaseURL("http://api.example.com")).toThrow(
      /HTTPS/,
    );
  });
});
