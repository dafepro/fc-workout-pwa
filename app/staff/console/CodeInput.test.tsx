import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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

describe("the authenticator code field", () => {
  it("keeps the attributes that let a keyboard offer the code", () => {
    render(<Harness />);

    const field = screen.getByLabelText("Six-digit code");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("pattern", "[0-9]{6}");
    expect(field).toHaveAttribute("maxlength", "6");
  });

  // Alpha 1.1. inputMode="numeric" asks Android for the numeric keypad, and
  // that keypad has no suggestion strip -- which is the only place Gboard's
  // clipboard chip can appear. Asserted as an absence because the attribute
  // being set is exactly the bug, and it is a one-word change to reintroduce.
  it("does not force a numeric keypad, which would hide the keyboard's clipboard suggestion", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Six-digit code")).not.toHaveAttribute(
      "inputmode",
    );
  });

  // The paste button this replaced was a control on the page; the clipboard
  // chip belongs to the keyboard, so there is nothing here to click.
  it("offers no paste button of its own", () => {
    render(<Harness />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  // Whatever the keyboard pastes arrives as an ordinary change event, so the
  // sanitizing still has to hold for a whole "Your code is 123 456".
  it("takes the digits out of a paste that carries more than the code", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "Your code is 123 456" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("123456");
  });

  it("never lets anything but six digits reach the form", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "12a34-5678" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("123456");
  });
});
