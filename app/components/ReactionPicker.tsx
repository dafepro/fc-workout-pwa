"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "../content/copy";
import type { Player, ReactionType } from "../domain/types";

interface ReactionPickerProps {
  recipient: Player | null;
  contextLabel: string;
  onClose: () => void;
  onSend: (type: ReactionType, emoji: string) => Promise<void>;
}

export function ReactionPicker({
  recipient,
  contextLabel,
  onClose,
  onSend,
}: ReactionPickerProps) {
  const firstButton = useRef<HTMLButtonElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recipient) return;
    firstButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, recipient]);

  if (!recipient) return null;

  async function send(type: ReactionType, emoji: string) {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      await onSend(type, emoji);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.cheers.failed);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="reaction-picker-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !sending) onClose();
      }}
    >
      <section
        className="reaction-picker"
        role="dialog"
        aria-modal="true"
        aria-label={`Cheer for ${recipient.firstName}`}
      >
        <header>
          <div>
            <p className="eyebrow">{copy.cheers.pickerEyebrow}</p>
            <h2>{copy.cheers.pickerTitle(recipient.firstName)}</h2>
            <p className="reaction-picker__context">
              {copy.cheers.pickerContext(contextLabel)}
            </p>
          </div>
          <button
            type="button"
            className="reaction-picker__close"
            aria-label={copy.cheers.close}
            disabled={sending}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="reaction-picker__emojis">
          {copy.cheers.options.map((reaction, index) => (
            <button
              ref={index === 0 ? firstButton : undefined}
              type="button"
              key={reaction.type}
              aria-label={`Send ${reaction.label} to ${recipient.firstName}`}
              disabled={sending}
              onClick={() =>
                send(reaction.type as ReactionType, reaction.emoji)
              }
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              <small>{reaction.label}</small>
            </button>
          ))}
        </div>
        {error ? (
          <p className="reaction-picker__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
