"use client";

import { useRef, useState } from "react";
import { useHydrated } from "../../components/useHydrated";
import { staffCopy } from "./copy";

const CODE_LENGTH = 6;

/** Everything that is not a digit is noise, wherever the value came from. */
function sixDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * The TOTP field, shared by sign-in, first-run setup, and step-up.
 *
 * `autocomplete="one-time-code"` is the attribute that makes a keyboard offer a
 * code, but it is tied to codes that arrive by SMS and does nothing for one
 * read out of an authenticator app. On Android Chrome that left a long press on
 * the field as the only way to paste. The button does it directly, and is
 * absent where the Clipboard API is, rather than offering a control that cannot
 * work.
 */
export function CodeInput({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  autoFocus?: boolean;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  // Only asked once React is driving: the server has no clipboard to ask about,
  // and rendering the button into the HTML would put a control in the markup
  // that a browser without the API then has to take away again.
  const canPaste =
    useHydrated() && typeof navigator?.clipboard?.readText === "function";

  async function paste() {
    setFailed(false);
    try {
      onChange(sixDigits(await navigator.clipboard.readText()));
      field.current?.focus();
    } catch {
      // Denying the clipboard permission is a refusal, not a crash, and the
      // field still takes a typed code.
      setFailed(true);
    }
  }

  return (
    <>
      <label htmlFor={id}>{staffCopy.codeLabel}</label>
      <div className="code-field">
        <input
          ref={field}
          id={id}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{${CODE_LENGTH}}`}
          maxLength={CODE_LENGTH}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(sixDigits(event.target.value))}
          required
        />
        {canPaste ? (
          <button
            type="button"
            className="button button--outline code-field__paste"
            onClick={paste}
          >
            {staffCopy.pasteCode}
          </button>
        ) : null}
      </div>
      {failed ? (
        <p className="notice notice--error" role="alert">
          {staffCopy.pasteFailed}
        </p>
      ) : null}
    </>
  );
}
