"use client";

import { useState } from "react";
import Link from "next/link";
import { BoardSurface } from "./BoardSurface";
import { teamCanvasCopy } from "../content";
import {
  availableRewardCount,
  dailyEmojiSet,
  teamCanvasProjection,
  weeklyTextStyle,
} from "../model";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";

export function TeamCanvasBoard() {
  const {
    state,
    moveAvatar,
    chooseEmoji,
    editEmoji,
    cancelEmoji,
    pasteEmoji,
    recordCooldown,
  } = useTeamCanvas();
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const projection = teamCanvasProjection(state);
  const copy = teamCanvasCopy.board;

  if (!projection) {
    return (
      <section className="tc-locked">
        <span aria-hidden="true">＋</span>
        <h1>{teamCanvasCopy.locked.title}</h1>
        <p>{teamCanvasCopy.locked.body}</p>
        <Link href={teamCanvasRoutes.today}>
          {teamCanvasCopy.locked.action}
        </Link>
      </section>
    );
  }

  const rewardCount = availableRewardCount(state);
  const emojis = dailyEmojiSet(state.teamId, state.dayKey);

  return (
    <div className="tc-team">
      <header className="tc-team__heading">
        <div>
          <p className="tc-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <span className="tc-week">Mon—Sun</span>
      </header>

      <BoardSurface
        starCount={projection.starCount}
        avatarPosition={projection.avatarPosition}
        emojiDraft={state.emojiDraft}
        emojiPlacements={projection.emojiPlacements}
        textStyle={weeklyTextStyle(state.teamId, state.weekKey)}
        onMoveAvatar={moveAvatar}
        onMoveEmoji={(position) => editEmoji(position)}
      />
      <p className="tc-board-hint">{copy.moveHint}</p>

      <section className="tc-rewards" aria-labelledby="tc-rewards-title">
        <div className="tc-rewards__heading">
          <h2 id="tc-rewards-title">
            {rewardCount > 0 ? copy.rewardReady(rewardCount) : "Team stamps"}
          </h2>
          {state.dayKind === "training" && !state.cooldownComplete ? (
            <button type="button" onClick={() => setCooldownOpen(true)}>
              {copy.cooldownAction}
            </button>
          ) : (
            <span>{copy.cooldownDone}</span>
          )}
        </div>

        {cooldownOpen &&
        state.dayKind === "training" &&
        !state.cooldownComplete ? (
          <div className="tc-cooldown">
            <div>
              <strong>{copy.cooldownTitle}</strong>
              <p>{copy.cooldownBody}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                recordCooldown();
                setCooldownOpen(false);
              }}
            >
              {copy.cooldownSave}
            </button>
          </div>
        ) : null}

        {state.emojiDraft ? (
          <div className="tc-stamp-editor">
            <label>
              <span>{copy.size}</span>
              <input
                type="range"
                min="28"
                max="64"
                value={state.emojiDraft.size}
                onChange={(event) =>
                  editEmoji({ size: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{copy.rotation}</span>
              <input
                type="range"
                min="-45"
                max="45"
                value={state.emojiDraft.rotation}
                onChange={(event) =>
                  editEmoji({ rotation: Number(event.target.value) })
                }
              />
            </label>
            <div>
              <button type="button" onClick={cancelEmoji}>
                {copy.cancel}
              </button>
              <button className="tc-paste" type="button" onClick={pasteEmoji}>
                {copy.confirm}
              </button>
            </div>
          </div>
        ) : rewardCount > 0 ? (
          <div className="tc-emoji-tray">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={copy.chooseStamp(emoji)}
                onClick={() => chooseEmoji(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="tc-rewards__empty">{copy.emptyReward}</p>
        )}
      </section>
    </div>
  );
}
