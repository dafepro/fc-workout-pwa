"use client";

import Link from "next/link";
import { useOptionalAuth } from "../../state/auth-context";
import { teamCanvasStamp } from "../catalog";
import { teamCanvasCopy } from "../content";
import { teamCanvasMock } from "../mock-data";
import {
  availableRewardCount,
  teamCanvasProjection,
  weeklyTextStyle,
} from "../model";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";
import { BoardSurface, type BoardMember } from "./BoardSurface";
import { CanvasDevToolbox } from "./CanvasDevToolbox";
import { StampAssetView, stampAssetLabel } from "./StampAsset";

export function TeamCanvasBoard() {
  const auth = useOptionalAuth();
  const {
    state,
    connectedStatus,
    connectedProjection,
    localSettings,
    connectedError,
    selectedPieceId,
    moveAvatar,
    chooseStamp,
    togglePiece,
    editPiece,
    deletePiece,
    clearPiece,
    saveSettings,
  } = useTeamCanvas();
  const localProjection = teamCanvasProjection(state);
  const copy = teamCanvasCopy.board;

  if (connectedStatus === "loading") {
    return <p className="tc-opening">{copy.loading}</p>;
  }
  if (
    connectedStatus === "locked" ||
    (connectedStatus === "local" && !localProjection)
  ) {
    return <LockedCanvas />;
  }
  if (connectedStatus === "error" && !connectedProjection) {
    return (
      <section className="tc-locked" role="alert">
        <h1>{copy.connectedError}</h1>
        <p>{connectedError}</p>
        <Link href={teamCanvasRoutes.today}>
          {teamCanvasCopy.locked.action}
        </Link>
      </section>
    );
  }

  const connectedView = connectedStatus === "ready" && connectedProjection;
  const currentPlayerID = connectedView
    ? (auth?.currentPlayerID ?? "")
    : teamCanvasMock.player.id;
  const teamName = connectedView
    ? connectedProjection.team.name
    : teamCanvasMock.team.name;
  const members: BoardMember[] = connectedView
    ? connectedProjection.members.map((member) => ({
        player: member.player,
        avatar: member.avatarConfiguration,
        position: member.position,
        starDayKeys: member.starDayKeys,
      }))
    : [
        ...teamCanvasMock.completers.map((member) => ({
          player: member.player,
          avatar: member.avatar,
          position: { x: member.x, y: member.y },
          starDayKeys: [...member.starDayKeys],
        })),
        {
          player: teamCanvasMock.player,
          avatar: teamCanvasMock.playerAvatar,
          position: localProjection!.avatarPosition,
          starDayKeys: localProjection!.starDayKeys,
        },
      ];
  const settings = connectedView
    ? connectedProjection.settings
    : {
        ...localSettings,
        textStyle:
          localSettings.revision === 0
            ? weeklyTextStyle(state.teamId, state.weekKey)
            : localSettings.textStyle,
      };
  const pieces = connectedView
    ? connectedProjection.pieces
    : localProjection!.pieces;
  const rewardCount = connectedView
    ? connectedProjection.availableRewards
    : availableRewardCount(state);
  const stamps = connectedView
    ? connectedProjection.stampChoices
    : settings.stampChoices.map(teamCanvasStamp);

  return (
    <div className="tc-team">
      <header className="tc-team__heading">
        <div>
          <p className="tc-eyebrow">{copy.eyebrow}</p>
          <h1>{teamName}</h1>
        </div>
        <span className="tc-week">{copy.week}</span>
      </header>

      {connectedError ? (
        <p className="tc-sync-error" role="status">
          {connectedError}
        </p>
      ) : null}

      <BoardSurface
        teamName={teamName}
        currentPlayerID={currentPlayerID}
        members={members}
        pieces={pieces}
        selectedPieceId={selectedPieceId}
        textStyle={settings.textStyle}
        backgroundAssetID={settings.backgroundAssetId}
        backgroundColor={settings.backgroundColor}
        textColor={settings.textColor}
        textSize={settings.textSize}
        simulatePeers={!connectedView}
        onMoveAvatar={moveAvatar}
        onTogglePiece={togglePiece}
        onEditPiece={editPiece}
        onDeletePiece={(pieceId) => void deletePiece(pieceId)}
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
                  onClick={() => void chooseStamp(stamp)}
                >
                  <StampAssetView asset={stamp} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="tc-rewards__empty">
            {pieces.some(({ editable }) => editable)
              ? copy.placedReward
              : copy.emptyReward}
          </p>
        )}
      </section>

      {!connectedView || connectedProjection.developerControlsEnabled ? (
        <CanvasDevToolbox
          key={`${settings.revision}-${settings.backgroundAssetId}`}
          settings={settings}
          onSave={saveSettings}
        />
      ) : null}
    </div>
  );
}

function LockedCanvas() {
  return (
    <section className="tc-locked">
      <span aria-hidden="true">＋</span>
      <h1>{teamCanvasCopy.locked.title}</h1>
      <p>{teamCanvasCopy.locked.body}</p>
      <Link href={teamCanvasRoutes.today}>{teamCanvasCopy.locked.action}</Link>
    </section>
  );
}
