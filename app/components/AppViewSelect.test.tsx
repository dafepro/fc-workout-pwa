import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppViewSelect } from "./AppViewSelect";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("AppViewSelect", () => {
  it("uses one native selector for the three isolated player views", () => {
    render(<AppViewSelect currentView="classic" />);

    const selector = screen.getByRole("combobox", { name: "App view" });
    expect(selector).toHaveValue("/me");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(selector).toHaveTextContent("Classic Alpha");
    expect(selector).toHaveTextContent("Momentum Alpha");
    expect(selector).toHaveTextContent("Team Canvas");

    fireEvent.change(selector, { target: { value: "/team-canvas/me" } });
    expect(push).toHaveBeenCalledWith("/team-canvas/me");
  });
});
