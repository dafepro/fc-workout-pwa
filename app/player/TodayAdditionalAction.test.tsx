import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodayAdditionalAction } from "./TodayAdditionalAction";

const track = vi.fn();

vi.mock("../../lib/analytics/AnalyticsProvider", () => ({
  useAnalytics: () => ({ track }),
}));

describe("TodayAdditionalAction", () => {
  it("restores the four consolidated secondary destinations", () => {
    render(<TodayAdditionalAction teamLocked={false} />);

    const list = screen.getByRole("list", {
      name: "Other things you can do",
    });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/team",
      "/log/additional",
      "/prizes",
      "/progress",
    ]);

    const action = screen.getByRole("link", {
      name: /Log another activity/i,
    });
    expect(action).toHaveAttribute("href", "/log/additional");
    expect(action).toHaveTextContent(
      "Record something outside the planned workout.",
    );

    action.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(action);
    expect(track).toHaveBeenCalledWith("training_entry_started", {
      source: "navigation",
      defaulted_activity: false,
    });
  });

  it("explains when the Lounge is still locked without removing its row", () => {
    render(<TodayAdditionalAction teamLocked />);

    expect(
      screen.getByRole("link", { name: /Team lounge/i }),
    ).toHaveTextContent("Complete today’s plan to enter.");
  });
});
