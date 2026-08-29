"use client";

import { useState } from "react";

import { copy } from "../content/copy";
import { loungeEmotes, type LoungeEmote } from "./lounge-emotes";
import {
  loungeQuickPhrases,
  type LoungeQuickPhrase,
} from "./lounge-quick-phrases";
import type { LoungeItemChoice } from "./lounge-items";
import { LoungeItemArt } from "./LoungeItemArt";

type Tray = "emotes" | "quick-phrases" | "stamps" | "items" | null;

export function LoungeActionDock({
  choices,
  selectedItem,
  remaining,
  placing,
  reactionLocked,
  onSelectItem,
  onSendEmote,
  onSendQuickPhrase,
}: {
  choices: readonly LoungeItemChoice[];
  selectedItem: LoungeItemChoice | null;
  remaining: number;
  placing: boolean;
  reactionLocked: boolean;
  onSelectItem(item: LoungeItemChoice): void;
  onSendEmote(emote: LoungeEmote): void;
  onSendQuickPhrase(phrase: LoungeQuickPhrase): void;
}) {
  const [tray, setTray] = useState<Tray>(null);
  const actions = copy.teamLounge.actions;
  const openInventory = tray === "stamps" || tray === "items";
  const filteredChoices = choices.filter(({ kind }) =>
    tray === "items" ? kind === "lounge_prop" : kind === "lounge_stamp",
  );

  const toggle = (next: Exclude<Tray, null>) => {
    setTray((current) => (current === next ? null : next));
  };

  return (
    <>
      {openInventory ? (
        <div
          className="team-lounge__menu-overlay"
          data-canvas-pointer-ignore="true"
        >
          <button
            type="button"
            className="team-lounge__menu-backdrop"
            aria-label={actions.closeItems}
            onClick={() => setTray(null)}
          />
          <section
            className="team-lounge__menu-sheet"
            role="dialog"
            aria-label={actions.chooseItem}
          >
            <header>
              <strong>{actions.chooseItem}</strong>
              <button
                type="button"
                aria-label={actions.closeItems}
                onClick={() => setTray(null)}
              >
                ×
              </button>
            </header>
            <div className="team-lounge__item-tabs" role="tablist">
              {(["stamps", "items"] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={tray === category}
                  onClick={() => setTray(category)}
                >
                  {category === "stamps" ? actions.stamps : actions.items}
                </button>
              ))}
            </div>
            <p className="team-lounge__placement-budget">
              {remaining > 0
                ? actions.placementsLeft(remaining)
                : actions.exhausted}
            </p>
            <div className="team-lounge__item-grid">
              {filteredChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  aria-label={actions.choosePlacement(
                    choice.label,
                    choice.kind === "lounge_prop" ? "item" : "stamp",
                  )}
                  aria-pressed={selectedItem?.id === choice.id}
                  disabled={placing || remaining === 0}
                  onClick={() => {
                    onSelectItem(choice);
                    setTray(null);
                  }}
                >
                  <LoungeItemArt item={choice} />
                  <strong>{choice.label}</strong>
                  <small>
                    {choice.source === "included"
                      ? actions.included
                      : actions.earned}
                  </small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <nav
        className="team-lounge__actions"
        aria-label={actions.navigation}
        data-canvas-pointer-ignore="true"
      >
        {tray === "emotes" || tray === "quick-phrases" ? (
          <div
            className="team-lounge__reaction-popover"
            aria-label={
              tray === "emotes"
                ? actions.chooseEmote
                : actions.chooseQuickMessage
            }
          >
            <div
              className={`team-lounge__reaction-options team-lounge__reaction-options--${tray}`}
            >
              {tray === "emotes"
                ? loungeEmotes.map((emote) => (
                    <button
                      key={emote.id}
                      type="button"
                      aria-label={actions.sendEmote(emote.label)}
                      disabled={reactionLocked}
                      onClick={() => {
                        onSendEmote(emote);
                        setTray(null);
                      }}
                    >
                      {emote.symbol}
                    </button>
                  ))
                : loungeQuickPhrases.map((phrase) => (
                    <button
                      key={phrase.id}
                      type="button"
                      aria-label={actions.sendQuickMessage(phrase.text)}
                      disabled={reactionLocked}
                      onClick={() => {
                        onSendQuickPhrase(phrase);
                        setTray(null);
                      }}
                    >
                      {phrase.text}
                    </button>
                  ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          aria-pressed={tray === "stamps"}
          onClick={() => toggle("stamps")}
        >
          <span aria-hidden="true">✦</span>
          {actions.stamps}
        </button>
        <button
          type="button"
          aria-pressed={tray === "items"}
          onClick={() => toggle("items")}
        >
          <span aria-hidden="true">▣</span>
          {actions.items}
        </button>
        <button
          type="button"
          aria-pressed={tray === "quick-phrases"}
          onClick={() => toggle("quick-phrases")}
        >
          <span aria-hidden="true">▤</span>
          {actions.quickMessages}
        </button>
        <button
          type="button"
          aria-pressed={tray === "emotes"}
          onClick={() => toggle("emotes")}
        >
          <span aria-hidden="true">☺</span>
          {actions.emotes}
        </button>
      </nav>
    </>
  );
}
