import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
const session = vi.hoisted(() => ({ signedInAs: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ cookie: "session=old" })),
}));
vi.mock("next/navigation", () => ({ redirect: navigation.redirect }));
vi.mock("../api/session-role", () => ({ signedInAs: session.signedInAs }));
vi.mock("../api/backend", () => ({ devAccessEnabled: () => true }));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    navigation.redirect.mockReset();
    session.signedInAs.mockReset();
  });

  it("renders the credential entry even when another player session exists", async () => {
    session.signedInAs.mockResolvedValue("player");

    await LoginPage();

    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});
