import { describe, expect, it } from "vitest";
import { routes } from "../../content/routes";
import { staffSetupDestination, staffSignInDestination } from "./destination";

describe("staffSignInDestination", () => {
  it("sends signed-out dev visitors to the credential directory", () => {
    expect(staffSignInDestination(true, false)).toBe(routes.devAccess);
  });

  it("keeps the production sign-in form available", () => {
    expect(staffSignInDestination(false, false)).toBeNull();
  });

  it("sends authenticated staff to their console", () => {
    expect(staffSignInDestination(true, true)).toBe(routes.staffConsoleHome);
  });
});

describe("staffSetupDestination", () => {
  it("keeps setup out of the dev environment", () => {
    expect(staffSetupDestination(true)).toBe(routes.devAccess);
  });

  it("keeps production setup available", () => {
    expect(staffSetupDestination(false)).toBeNull();
  });
});
