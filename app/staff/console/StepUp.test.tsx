import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepUpForm } from "./StepUp";

afterEach(() => vi.unstubAllGlobals());

function enterPassword() {
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "local-test-password" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }));
}

describe("server-directed step-up", () => {
  it("confirms a password-only server outcome without requesting a nonexistent code", async () => {
    const fetch = vi.fn(async () => Response.json({ confirmed: true }));
    vi.stubGlobal("fetch", fetch);
    const confirmed = vi.fn();
    render(<StepUpForm onCancel={vi.fn()} onConfirmed={confirmed} />);
    expect(screen.queryByLabelText("Six-digit code")).toBeNull();
    enterPassword();
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires a second factor when the server returns a challenge", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ challenge: "local-challenge" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const confirmed = vi.fn();
    render(<StepUpForm onCancel={vi.fn()} onConfirmed={confirmed} />);
    enterPassword();
    fireEvent.change(await screen.findByLabelText("Six-digit code"), {
      target: { value: "123456" },
    });
    expect(confirmed).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      challenge: "local-challenge",
      code: "123456",
    });
  });

  it.each([
    {},
    { confirmed: "true" },
    { confirmed: false },
    { challenge: "" },
    { confirmed: true, challenge: "unexpected" },
  ])(
    "does not replay an action for a malformed outcome %j",
    async (outcome) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(outcome)),
      );
      const confirmed = vi.fn();
      render(<StepUpForm onCancel={vi.fn()} onConfirmed={confirmed} />);
      enterPassword();
      await screen.findByRole("alert");
      expect(confirmed).not.toHaveBeenCalled();
    },
  );

  it("restarts a spent challenge after a failed code without confirming the held action", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ challenge: "local-challenge" }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: "invalid_login" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ challenge: "retry-challenge" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const confirmed = vi.fn();
    render(<StepUpForm onCancel={vi.fn()} onConfirmed={confirmed} />);
    enterPassword();
    fireEvent.change(await screen.findByLabelText("Six-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(confirmed).not.toHaveBeenCalled();
    enterPassword();
    fireEvent.change(await screen.findByLabelText("Six-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
      challenge: "retry-challenge",
      code: "123456",
    });
  });
});
