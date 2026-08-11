import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransientQueryToast } from "./TransientQueryToast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("TransientQueryToast", () => {
  it("shows briefly and removes its query flag from history", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/me?avatar=saved");
    render(
      <TransientQueryToast
        parameter="avatar"
        value="saved"
        message="Avatar saved"
      />,
    );

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Avatar saved");
    expect(window.location.pathname).toBe("/me");
    expect(window.location.search).toBe("");

    act(() => vi.advanceTimersByTime(4200));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing without the matching flag", () => {
    render(
      <TransientQueryToast
        parameter="avatar"
        value="saved"
        message="Avatar saved"
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
