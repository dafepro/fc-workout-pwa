import { describe, expect, it } from "vitest";
import { resolveBackendBaseURL } from "./backend-config";

describe("resolveBackendBaseURL", () => {
  it("prefers the ZoomiGo production binding", () => {
    expect(
      resolveBackendBaseURL({ zoomigo: "https://api.quicktrack.cc/" }),
    ).toBe("https://api.quicktrack.cc");
  });

  it("temporarily accepts the legacy binding", () => {
    expect(
      resolveBackendBaseURL({ stridecrew: "https://api.quicktrack.cc" }),
    ).toBe("https://api.quicktrack.cc");
  });

  it("accepts matching bindings during migration", () => {
    expect(
      resolveBackendBaseURL({
        zoomigo: "https://api.quicktrack.cc/",
        stridecrew: "https://api.quicktrack.cc",
      }),
    ).toBe("https://api.quicktrack.cc");
  });

  it("rejects conflicting bindings instead of silently choosing one", () => {
    expect(() =>
      resolveBackendBaseURL({
        zoomigo: "https://api.quicktrack.cc",
        stridecrew: "https://other.example",
      }),
    ).toThrow(/conflict/i);
  });

  it("requires HTTPS except for the private Docker API hostname", () => {
    expect(resolveBackendBaseURL({ zoomigo: "http://api:8080" })).toBe(
      "http://api:8080",
    );
    expect(() =>
      resolveBackendBaseURL({ zoomigo: "http://api.example.com" }),
    ).toThrow(/HTTPS/);
  });
});
