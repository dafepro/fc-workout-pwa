"use client";

import { useState } from "react";

import { copy } from "../content/copy";
import {
  loungeChatPacks,
  MAX_ACTIVE_LOUNGE_CHAT_PACKS,
  toggleLoungeChatPack,
  type LoungeChatPackID,
} from "./lounge-quick-phrases";

export function LoungeChatSettings({
  activePackIDs,
  unlockedPackIDs,
  onChange,
}: {
  activePackIDs: readonly LoungeChatPackID[];
  unlockedPackIDs: readonly LoungeChatPackID[];
  onChange(packIDs: LoungeChatPackID[]): void;
}) {
  const [open, setOpen] = useState(false);
  const actions = copy.teamLounge.actions;
  const atLimit = activePackIDs.length >= MAX_ACTIVE_LOUNGE_CHAT_PACKS;

  return (
    <div
      className="team-lounge__chat-settings"
      data-canvas-pointer-ignore="true"
    >
      <button
        type="button"
        className="team-lounge__settings-wheel"
        aria-label={actions.chatSettings}
        aria-expanded={open}
        aria-controls="lounge-chat-settings-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {open ? (
        <section
          id="lounge-chat-settings-panel"
          className="team-lounge__chat-settings-panel"
          role="dialog"
          aria-label={actions.chooseChatPacks}
        >
          <header>
            <div>
              <strong>{actions.chooseChatPacks}</strong>
              <small>{actions.chatPackLimit}</small>
            </div>
            <button
              type="button"
              aria-label={actions.closeChatSettings}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <p aria-live="polite">
            {actions.chatPacksSelected(
              activePackIDs.length,
              MAX_ACTIVE_LOUNGE_CHAT_PACKS,
            )}
          </p>
          <div className="team-lounge__chat-pack-options">
            {loungeChatPacks.map((pack) => {
              const checked = activePackIDs.includes(pack.id);
              const unlocked = unlockedPackIDs.includes(pack.id);
              return (
                <label key={pack.id} data-locked={!unlocked || undefined}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      !unlocked ||
                      (checked && activePackIDs.length === 1) ||
                      (!checked && atLimit)
                    }
                    onChange={() =>
                      onChange(toggleLoungeChatPack(activePackIDs, pack.id))
                    }
                  />
                  <span>
                    <strong>{pack.label}</strong>
                    <small>{pack.description}</small>
                  </span>
                  {!unlocked ? (
                    <span
                      className="team-lounge__chat-pack-lock"
                      aria-label={actions.chatPackLocked}
                    >
                      <span aria-hidden="true">🔒</span>
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
