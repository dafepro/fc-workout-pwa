import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ signedInAs: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ cookie: "session=old" })),
}));
vi.mock("../api/session-role", () => ({ signedInAs: session.signedInAs }));
vi.mock("../api/backend", () => ({ devAccessEnabled: () => true }));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => session.signedInAs.mockReset());

  it("passes dev mode and the existing session to fragment-aware login", async () => {
    session.signedInAs.mockResolvedValue("player");

    const page = await LoginPage();

    expect(page.props).toMatchObject({
      devAccess: true,
      existingSession: "player",
    });
  });
});
