"use client";

import { useEffect, useRef, useState } from "react";

import { copy } from "../content/copy";
import { loungeEmotes, type LoungeEmote } from "./lounge-emotes";
import {
  includedLoungeChatPackIDs,
  loungeChatPacks,
  type LoungeChatPackID,
  type LoungeQuickPhrase,
} from "./lounge-quick-phrases";
import type { LoungeItemChoice } from "./lounge-items";
import { LoungeItemArt } from "./LoungeItemArt";

type Tray = "emotes" | "quick-phrases" | "stamps" | "items" | null;
type ChatLayer = "sets" | LoungeChatPackID;

const menuTransitionMs = 160;

export function LoungeActionDock({
  choices,
  selectedItem,
  remaining,
  capacity,
  placing,
  reactionLocked,
  connectionState = "online",
  activePackIDs = includedLoungeChatPackIDs,
  onSelectItem,
  onSendEmote,
  onSendQuickPhrase,
}: {
  choices: readonly LoungeItemChoice[];
  selectedItem: LoungeItemChoice | null;
  remaining: number;
  capacity: number;
  placing: boolean;
  reactionLocked: boolean;
  connectionState?: "online" | "reconnecting";
  activePackIDs?: readonly LoungeChatPackID[];
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
  const activePacks = activePackIDs.flatMap((packID) => {
    const pack = loungeChatPacks.find(({ id }) => id === packID);
    return pack ? [pack] : [];
  });
  const selectedPack =
    chatLayer === "sets"
      ? null
      : (activePacks.find(({ id }) => id === chatLayer) ?? null);
  const visibleChatLayer = selectedPack ? chatLayer : "sets";
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

  const finishItemSelection = (item: LoungeItemChoice) => {
    window.clearTimeout(closeTimerRef.current);
    setTray(null);
    setClosing(false);
    onSelectItem(item);
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
              <span>
                {actions.placementSummary(capacity - remaining, capacity)}
              </span>
              <span>
                {remaining > 0
                  ? actions.placementsLeft(remaining)
                  : actions.exhausted}
              </span>
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
                  onClick={() => finishItemSelection(choice)}
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
        {connectionState === "reconnecting" ? (
          <p className="team-lounge__connection-status" role="status">
            <span aria-hidden="true" />
            <span>
              <strong>{copy.teamLounge.reconnecting}</strong>{" "}
              {copy.teamLounge.reconnectingDetail}
            </span>
          </p>
        ) : null}
        {tray === "emotes" || tray === "quick-phrases" ? (
          <div
            className="team-lounge__reaction-popover"
            role="dialog"
            aria-label={
              tray === "emotes"
                ? actions.chooseEmote
                : visibleChatLayer === "sets"
                  ? actions.chooseQuickMessage
                  : actions.chooseChatPack(selectedPack?.label ?? "chat pack")
            }
            data-anchor={tray === "emotes" ? "react" : "chat"}
            data-layer={tray === "quick-phrases" ? visibleChatLayer : undefined}
            data-layout={
              tray === "quick-phrases"
                ? visibleChatLayer === "sets"
                  ? "compact"
                  : "expanded"
                : undefined
            }
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
            ) : (
              <div className="team-lounge__chat-menu">
                {selectedPack ? (
                  <div className="team-lounge__chat-wing">
                    {selectedPack.phrases.slice(0, 5).map((phrase) => (
                      <QuickPhraseButton
                        key={phrase.id}
                        phrase={phrase}
                        disabled={reactionLocked}
                        onSend={() => {
                          onSendQuickPhrase(phrase);
                          closeTray();
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="team-lounge__chat-sets">
                  {activePacks.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      aria-pressed={visibleChatLayer === pack.id}
                      onClick={() => setChatLayer(pack.id)}
                    >
                      <strong>{pack.label}</strong>
                    </button>
                  ))}
                </div>
                {selectedPack ? (
                  <div className="team-lounge__chat-wing">
                    {selectedPack.phrases.slice(5).map((phrase) => (
                      <QuickPhraseButton
                        key={phrase.id}
                        phrase={phrase}
                        disabled={reactionLocked}
                        onSend={() => {
                          onSendQuickPhrase(phrase);
                          closeTray();
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        <button
          type="button"
          disabled={connectionState === "reconnecting"}
          aria-label={actions.actionPlacements(actions.stamps, remaining)}
          aria-pressed={tray === "stamps"}
          onClick={() => toggle("stamps")}
        >
          <span aria-hidden="true">✦</span>
          {actions.stamps}
          {remaining > 0 ? (
            <b className="team-lounge__placement-badge" aria-hidden="true">
              {remaining}
            </b>
          ) : null}
        </button>
        <button
          type="button"
          disabled={connectionState === "reconnecting"}
          aria-label={actions.actionPlacements(actions.items, remaining)}
          aria-pressed={tray === "items"}
          onClick={() => toggle("items")}
        >
          <span aria-hidden="true">▣</span>
          {actions.items}
          {remaining > 0 ? (
            <b className="team-lounge__placement-badge" aria-hidden="true">
              {remaining}
            </b>
          ) : null}
        </button>
        <button
          type="button"
          disabled={connectionState === "reconnecting"}
          aria-pressed={tray === "quick-phrases"}
          onClick={() => toggle("quick-phrases")}
        >
          <span aria-hidden="true">▤</span>
          {actions.quickMessages}
        </button>
        <button
          type="button"
          disabled={connectionState === "reconnecting"}
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

function QuickPhraseButton({
  phrase,
  disabled,
  onSend,
}: {
  phrase: LoungeQuickPhrase;
  disabled: boolean;
  onSend(): void;
}) {
  return (
    <button
      type="button"
      aria-label={copy.teamLounge.actions.sendQuickMessage(phrase.text)}
      disabled={disabled}
      onClick={onSend}
    >
      {phrase.text}
    </button>
  );
}
