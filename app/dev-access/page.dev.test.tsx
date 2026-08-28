import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DevAccessPage from "./page.dev";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  useRouter: () => ({ replace }),
}));

vi.mock("../api/backend", () => ({
  backendBaseURL: () => "http://api.example.test",
  backendHeaders: () => ({ "X-Zoomigo-Dev-Gateway": "test" }),
  devAccessEnabled: () => true,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

const players = ["Avery", "Blake", "Casey", "Devon"].map((name, index) => ({
  name,
  loginUrl: `/login#credential=player-${index + 1}`,
  qrPngBase64: "cXItcG5n",
}));

describe("DevAccessPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          players,
          pin: "1111",
          adminEmail: "preview-admin@example.test",
          adminPassword: "preview-staff-password",
        }),
      }),
    );
  });

  it("puts staff access first and exposes every preview player shortcut", async () => {
    render(await DevAccessPage());

    const staffHeading = screen.getByRole("heading", {
      name: "Staff access",
    });
    const playersHeading = screen.getByRole("heading", {
      name: "Player accounts",
    });
    expect(
      staffHeading.compareDocumentPosition(playersHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("preview-admin@example.test")).toBeVisible();
    expect(screen.getByText("preview-staff-password")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign in as administrator" }),
    ).toBeVisible();
    expect(screen.getByText("1111")).toBeVisible();
    expect(
      screen.getAllByRole("img", { name: /QR sign-in code for/ }),
    ).toHaveLength(4);
    expect(
      screen.getAllByRole("link", { name: /Open .* sign-in/ }),
    ).toHaveLength(4);
  });
});
