"use client";

import Link from "next/link";
import { BoardSurface } from "./BoardSurface";
import { StampAssetView, stampAssetLabel } from "./StampAsset";
import { teamCanvasCopy } from "../content";
import {
  availableRewardCount,
  dailyStampSet,
  teamCanvasProjection,
  weeklyTextStyle,
} from "../model";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";

export function TeamCanvasBoard() {
  const { state, moveAvatar, chooseStamp, togglePiece, editPiece, clearPiece } =
    useTeamCanvas();
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
  const stamps = dailyStampSet(state.teamId, state.dayKey);

  return (
    <div className="tc-team">
      <header className="tc-team__heading">
        <div>
          <p className="tc-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <span className="tc-week">{copy.week}</span>
      </header>

      <BoardSurface
        starDayKeys={projection.starDayKeys}
        avatarPosition={projection.avatarPosition}
        pieces={projection.pieces}
        selectedPieceId={state.selectedPieceId}
        textStyle={weeklyTextStyle(state.teamId, state.weekKey)}
        onMoveAvatar={moveAvatar}
        onTogglePiece={togglePiece}
        onEditPiece={editPiece}
        onClearPiece={clearPiece}
      />
      <p className="tc-board-hint">{copy.moveHint}</p>

      <section className="tc-rewards" aria-labelledby="tc-rewards-title">
        <div className="tc-rewards__heading">
          <h2 id="tc-rewards-title">
            {rewardCount > 0 ? copy.rewardReady(rewardCount) : copy.stampTitle}
          </h2>
        </div>

        {rewardCount > 0 ? (
          <div className="tc-emoji-tray">
            {stamps.map((stamp) => {
              const label = stampAssetLabel(stamp);
              return (
                <button
                  key={stamp.id}
                  type="button"
                  aria-label={copy.chooseStamp(label)}
                  onClick={() => chooseStamp(stamp)}
                >
                  <StampAssetView asset={stamp} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="tc-rewards__empty">
            {projection.pieces.some(({ editable }) => editable)
              ? copy.placedReward
              : copy.emptyReward}
          </p>
        )}
      </section>
    </div>
  );
}
