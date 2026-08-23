import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { earliestAllowedDate, toDateInput } from "../domain/rules";
import { useLocalSessionClock } from "./useLocalSessionClock";

function ClockProbe() {
  const clock = useLocalSessionClock();
  return (
    <output
      data-testid="session-clock"
      data-date={clock.date}
      data-min={clock.earliestDate}
      data-time={clock.time}
    />
  );
}

describe("local session clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T04:45:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("leaves the timestamp empty during pre-render and seeds it in the browser", () => {
    const serverMarkup = renderToString(<ClockProbe />);
    expect(serverMarkup).toContain('data-date=""');
    expect(serverMarkup).toContain('data-time=""');
    expect(serverMarkup).toContain('data-min=""');

    render(<ClockProbe />);

    expect(screen.getByTestId("session-clock")).toHaveAttribute(
      "data-date",
      toDateInput(new Date()),
    );
    expect(screen.getByTestId("session-clock")).toHaveAttribute(
      "data-time",
      new Date().toTimeString().slice(0, 5),
    );
    expect(screen.getByTestId("session-clock")).toHaveAttribute(
      "data-min",
      earliestAllowedDate(new Date()),
    );
  });
});
