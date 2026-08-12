import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "./CodeInput";

function Harness({ id = "code" }: { id?: string }) {
  const [code, setCode] = useState("");
  return (
    <>
      <CodeInput id={id} value={code} onChange={setCode} />
      <output data-testid="value">{code}</output>
    </>
  );
}

function withClipboard(readText: () => Promise<string>) {
  vi.stubGlobal("navigator", { clipboard: { readText } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the authenticator code field", () => {
  it("keeps the attributes that let a keyboard offer the code", () => {
    withClipboard(async () => "");
    render(<Harness />);

    const field = screen.getByLabelText("Six-digit code");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("maxlength", "6");
  });

  // The whole point of the button: on Android Chrome a code copied out of an
  // authenticator app could only be entered by long-pressing the field.
  it("fills the field from the clipboard", async () => {
    withClipboard(async () => "123456");
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Paste code" }));

    expect(await screen.findByTestId("value")).toHaveTextContent("123456");
  });

  it("takes the digits out of a clipboard that carries more than the code", async () => {
    withClipboard(async () => " 123 456 \n");
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Paste code" }));

    expect(await screen.findByTestId("value")).toHaveTextContent("123456");
  });

  it("says so rather than silently doing nothing when the clipboard is refused", async () => {
    withClipboard(async () => {
      throw new Error("denied");
    });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Paste code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read the clipboard. Type the code in instead.",
    );
  });

  // Offering a control that cannot work is worse than not offering it.
  it("offers no paste button where the clipboard cannot be read", () => {
    vi.stubGlobal("navigator", {});
    render(<Harness />);

    expect(screen.getByLabelText("Six-digit code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Paste code" })).toBeNull();
  });

  it("never lets anything but six digits reach the form", () => {
    withClipboard(async () => "");
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "12a34-5678" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("123456");
  });
});
