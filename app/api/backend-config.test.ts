import { describe, expect, it } from "vitest";
import {
  missingBackendCodeFor,
  resolveBackendBaseURL,
  resolveBackendRequired,
} from "./backend-config";

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

describe("resolveBackendRequired", () => {
  it("fails closed only for an explicit production binding", () => {
    expect(resolveBackendRequired("true")).toBe(true);
    expect(resolveBackendRequired(undefined)).toBe(false);
    expect(() => resolveBackendRequired("sometimes")).toThrow(/true or false/);
  });

  it("uses a non-prototype error when production requires the backend", () => {
    expect(missingBackendCodeFor(true)).toBe("backend_required");
    expect(missingBackendCodeFor(false)).toBe("backend_not_configured");
  });
});
