"use client";

import { staffCopy } from "./copy";

const CODE_LENGTH = 6;

/** Everything that is not a digit is noise, wherever the value came from. A
 * keyboard's clipboard suggestion pastes whatever was copied -- "123 456", or a
 * whole "Your code is 123456" -- so the field keeps sanitizing. */
function sixDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * The TOTP field, shared by sign-in, first-run setup, and step-up.
 *
 * Alpha 1.1 replaced a full-width "Paste code" button with the platform's own
 * affordance: Gboard offers a clipboard chip in its suggestion strip for
 * recently copied text, which is one tap and needs no control on the page.
 *
 * The reason it never appeared here is `inputMode="numeric"`: that asks Android
 * for the numeric keypad, and the keypad has no suggestion strip for a chip to
 * appear in. Dropping it is the whole fix. The cost is a full keyboard for a
 * coach who types the code instead of copying it, which is the trade the
 * clipboard chip is worth -- `autocomplete="one-time-code"` and the digit
 * `pattern` still tell the browser and the keyboard what this field holds.
 *
 * No page can trigger that chip; it belongs to the keyboard, not the document.
 * So this is the most the web platform offers, and long-press paste and Ctrl+V
 * both still work.
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
  return (
    <>
      <label htmlFor={id}>{staffCopy.codeLabel}</label>
      <input
        id={id}
        className="code-input"
        name="code"
        type="text"
        autoComplete="one-time-code"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        pattern={`[0-9]{${CODE_LENGTH}}`}
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(sixDigits(event.target.value))}
        required
      />
      <p className="console-hint">{staffCopy.codeHint}</p>
    </>
  );
}
