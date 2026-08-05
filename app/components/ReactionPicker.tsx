"use client";

import { useEffect, useRef, useState } from "react";
import type { Player, ReactionType } from "../domain/types";

const reactionOptions: Array<{
  type: ReactionType;
  emoji: string;
  label: string;
}> = [
  { type: "clap", emoji: "👏", label: "Clap" },
  { type: "fire", emoji: "🔥", label: "Fire" },
  { type: "strong", emoji: "💪", label: "Strong" },
  { type: "hustle", emoji: "⚡", label: "Hustle" },
  { type: "runner", emoji: "🏃", label: "Runner" },
  { type: "wind", emoji: "💨", label: "Wind" },
  { type: "robot-leg", emoji: "🦿", label: "Robot leg" },
  { type: "do-it", emoji: "✓", label: "Do it" },
];

interface ReactionPickerProps {
  recipient: Player | null;
  onClose: () => void;
  onSend: (type: ReactionType, emoji: string) => Promise<void>;
}

export function ReactionPicker({
  recipient,
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
      setError(
        cause instanceof Error
          ? cause.message
          : "That cheer could not be sent.",
      );
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
            <p className="eyebrow">Choose a cheer</p>
            <h2>Cheer for {recipient.firstName}</h2>
          </div>
          <button
            type="button"
            className="reaction-picker__close"
            aria-label="Close reaction picker"
            disabled={sending}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="reaction-picker__emojis">
          {reactionOptions.map((reaction, index) => (
            <button
              ref={index === 0 ? firstButton : undefined}
              type="button"
              key={reaction.type}
              aria-label={`Send ${reaction.label} to ${recipient.firstName}`}
              disabled={sending}
              onClick={() => send(reaction.type, reaction.emoji)}
            >
              {reaction.emoji}
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
