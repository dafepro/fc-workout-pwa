import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodayAdditionalAction } from "./TodayAdditionalAction";

const track = vi.fn();

vi.mock("../../lib/analytics/AnalyticsProvider", () => ({
  useAnalytics: () => ({ track }),
}));

describe("TodayAdditionalAction", () => {
  it("keeps additional activity logging on Today", () => {
    render(<TodayAdditionalAction showAdditionalWorkout />);

    const action = screen.getByRole("link", {
      name: /Log another activity/i,
    });
    expect(action).toHaveAttribute("href", "/log");
    expect(action).toHaveTextContent(
      "Record something outside today’s completed workout.",
    );

    action.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(action);
    expect(track).toHaveBeenCalledWith("training_entry_started", {
      source: "navigation",
      defaulted_activity: true,
    });
  });

  it("always offers the one Prize Boxes destination", () => {
    render(<TodayAdditionalAction showAdditionalWorkout={false} />);

    expect(screen.getByRole("link", { name: /Prize boxes/i })).toHaveAttribute(
      "href",
      "/prizes",
    );
    expect(
      screen.queryByRole("link", { name: /Log another activity/i }),
    ).not.toBeInTheDocument();
  });
});
