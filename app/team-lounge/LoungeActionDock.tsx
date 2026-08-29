"use client";

import { useEffect, useRef, useState } from "react";

import { copy } from "../content/copy";
import { loungeEmotes, type LoungeEmote } from "./lounge-emotes";
import {
  loungeQuickPhrases,
  type LoungeQuickPhrase,
} from "./lounge-quick-phrases";
import type { LoungeItemChoice } from "./lounge-items";
import { LoungeItemArt } from "./LoungeItemArt";

type Tray = "emotes" | "quick-phrases" | "stamps" | "items" | null;
type ChatLayer = "sets" | "standard";

const menuTransitionMs = 160;

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
  const [chatLayer, setChatLayer] = useState<ChatLayer>("sets");
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const actions = copy.teamLounge.actions;
  const openInventory = tray === "stamps" || tray === "items";
  const filteredChoices = choices.filter(({ kind }) =>
    tray === "items" ? kind === "lounge_prop" : kind === "lounge_stamp",
  );

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const closeTray = () => {
    if (!tray || closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setTray(null);
      setClosing(false);
      setChatLayer("sets");
    }, menuTransitionMs);
  };

  const toggle = (next: Exclude<Tray, null>) => {
    if (tray === next && !closing) {
      closeTray();
      return;
    }
    window.clearTimeout(closeTimerRef.current);
    setClosing(false);
    setTray(next);
    if (next === "quick-phrases") setChatLayer("sets");
  };

  return (
    <>
      {openInventory ? (
        <div
          className="team-lounge__menu-overlay"
          data-state={closing ? "closing" : "open"}
          data-canvas-pointer-ignore="true"
        >
          <button
            type="button"
            className="team-lounge__menu-backdrop"
            aria-label={actions.closeItems}
            onClick={closeTray}
          />
          <section
            className="team-lounge__menu-sheet"
            role="dialog"
            aria-label={actions.chooseItem}
            data-state={closing ? "closing" : "open"}
          >
            <header>
              <strong>{actions.chooseItem}</strong>
              <button
                type="button"
                aria-label={actions.closeItems}
                onClick={closeTray}
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
                    closeTray();
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
            role="dialog"
            aria-label={
              tray === "emotes"
                ? actions.chooseEmote
                : chatLayer === "sets"
                  ? actions.chooseQuickMessage
                  : actions.chooseStandardChat
            }
            data-anchor={tray === "emotes" ? "react" : "chat"}
            data-state={closing ? "closing" : "open"}
          >
            {tray === "emotes" ? (
              <div className="team-lounge__reaction-options team-lounge__reaction-options--emotes">
                {loungeEmotes.map((emote) => (
                  <button
                    key={emote.id}
                    type="button"
                    aria-label={actions.sendEmote(emote.label)}
                    disabled={reactionLocked}
                    onClick={() => {
                      onSendEmote(emote);
                      closeTray();
                    }}
                  >
                    {emote.symbol}
                  </button>
                ))}
              </div>
            ) : chatLayer === "sets" ? (
              <div className="team-lounge__chat-sets">
                <button
                  type="button"
                  aria-label={actions.standardChats}
                  onClick={() => setChatLayer("standard")}
                >
                  <strong>{actions.standardChats}</strong>
                  <small>10 messages</small>
                </button>
                {[2, 3].map((set) => (
                  <button
                    key={set}
                    type="button"
                    aria-label={actions.lockedChatSet(set)}
                    disabled
                  >
                    <strong>Set {set}</strong>
                    <small>Locked</small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="team-lounge__chat-back"
                  aria-label={actions.backToChatSets}
                  onClick={() => setChatLayer("sets")}
                >
                  ‹ {actions.standardChats}
                </button>
                <div className="team-lounge__reaction-options team-lounge__reaction-options--quick-phrases">
                  {loungeQuickPhrases.map((phrase) => (
                    <button
                      key={phrase.id}
                      type="button"
                      aria-label={actions.sendQuickMessage(phrase.text)}
                      disabled={reactionLocked}
                      onClick={() => {
                        onSendQuickPhrase(phrase);
                        closeTray();
                      }}
                    >
                      {phrase.text}
                    </button>
                  ))}
                </div>
              </>
            )}
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
