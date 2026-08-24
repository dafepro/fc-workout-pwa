"use client";

import Link from "next/link";
import { useRef } from "react";
import { migrateAvatarConfiguration } from "../../avatar/config";
import { useAvatarIdentity } from "../../state/avatar-identity-context";
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
import type { StampAsset } from "../model";
import { BoardSurface, type BoardMember } from "./BoardSurface";
import { CanvasDevToolbox } from "./CanvasDevToolbox";
import { StampAssetView, stampAssetLabel } from "./StampAsset";

export function TeamCanvasBoard({
  showDeveloperTools = true,
  todayHref = teamCanvasRoutes.today,
  stampUnlocks,
}: {
  showDeveloperTools?: boolean;
  todayHref?: string;
  stampUnlocks?: TeamCanvasStampUnlockPort;
}) {
  const auth = useOptionalAuth();
  const avatarIdentity = useAvatarIdentity();
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
  const viewedNewStamps = useRef(false);

  if (connectedStatus === "loading") {
    return <p className="tc-opening">{copy.loading}</p>;
  }
  if (
    connectedStatus === "locked" ||
    (connectedStatus === "local" && !localProjection)
  ) {
    return <LockedCanvas todayHref={todayHref} />;
  }
  if (connectedStatus === "error" && !connectedProjection) {
    return (
      <section className="tc-locked" role="alert">
        <h1>{copy.connectedError}</h1>
        <p>{connectedError}</p>
        <Link href={todayHref}>{teamCanvasCopy.locked.action}</Link>
      </section>
    );
  }

  const connectedView = connectedStatus === "ready" && connectedProjection;
  const currentPlayerID = connectedView
    ? (auth?.currentPlayerID ?? avatarIdentity.currentPlayerID)
    : teamCanvasMock.player.id;
  const savedAvatar = migrateAvatarConfiguration(avatarIdentity.avatarConfig);
  const teamName = connectedView
    ? connectedProjection.team.name
    : teamCanvasMock.team.name;
  const members: BoardMember[] = connectedView
    ? connectedProjection.members.map((member) => ({
        player: member.player,
        avatar:
          member.player.id === currentPlayerID && savedAvatar
            ? savedAvatar
            : member.avatarConfiguration,
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
          avatar: savedAvatar ?? teamCanvasMock.playerAvatar,
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
  const rewardCount =
    stampUnlocks?.availableCount ??
    (connectedView
      ? connectedProjection.availableRewards
      : availableRewardCount(state));
  const stamps =
    stampUnlocks?.choices ??
    (connectedView
      ? connectedProjection.stampChoices
      : settings.stampChoices.map(teamCanvasStamp));
  const unlockStamp = stampUnlocks?.unlock ?? chooseStamp;
  function viewNewStamps() {
    if (
      viewedNewStamps.current ||
      !stampUnlocks?.viewNew ||
      stampUnlocks.newAssetIDs?.length === 0
    ) {
      return;
    }
    viewedNewStamps.current = true;
    void Promise.resolve(stampUnlocks.viewNew()).catch(() => {
      viewedNewStamps.current = false;
    });
  }

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
      <p className="tc-board-hint">
        {pieces.some(({ physics }) => physics)
          ? copy.physicsHint
          : copy.moveHint}
      </p>

      <section className="tc-rewards" aria-labelledby="tc-rewards-title">
        <div className="tc-rewards__heading">
          <h2 id="tc-rewards-title">
            {rewardCount > 0 ? copy.rewardReady(rewardCount) : copy.stampTitle}
          </h2>
        </div>

        {stampUnlocks?.status === "loading" ? (
          <p className="tc-rewards__inventory" role="status">
            {copy.stampsLoading}
          </p>
        ) : stampUnlocks?.status === "error" ? (
          <p className="tc-rewards__inventory" role="status">
            {copy.stampsFailed}
          </p>
        ) : null}

        {rewardCount > 0 ? (
          <div
            className="tc-emoji-tray"
            onFocusCapture={viewNewStamps}
            onPointerDown={viewNewStamps}
          >
            {stamps.map((stamp) => {
              const label = stampAssetLabel(stamp);
              const isNew = stampUnlocks?.newAssetIDs?.includes(stamp.id);
              return (
                <button
                  key={stamp.id}
                  type="button"
                  aria-label={`${copy.chooseStamp(label)}${isNew ? `, ${copy.newStamp}` : ""}`}
                  onClick={() => void unlockStamp(stamp)}
                >
                  <StampAssetView asset={stamp} />
                  {isNew ? (
                    <span className="tc-stamp-new" aria-hidden="true">
                      {copy.newStamp}
                    </span>
                  ) : null}
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

      {showDeveloperTools &&
      (!connectedView || connectedProjection.developerControlsEnabled) ? (
        <CanvasDevToolbox
          key={`${settings.revision}-${settings.backgroundAssetId}`}
          settings={settings}
          onSave={saveSettings}
        />
      ) : null}
    </div>
  );
}

export interface TeamCanvasStampUnlockPort {
  availableCount: number;
  choices: StampAsset[];
  status?: "loading" | "error" | "ready";
  newAssetIDs?: string[];
  unlock(asset: StampAsset): Promise<void>;
  viewNew?(): void | Promise<void>;
}

function LockedCanvas({ todayHref }: { todayHref: string }) {
  return (
    <section className="tc-locked">
      <span aria-hidden="true">＋</span>
      <h1>{teamCanvasCopy.locked.title}</h1>
      <p>{teamCanvasCopy.locked.body}</p>
      <Link href={todayHref}>{teamCanvasCopy.locked.action}</Link>
    </section>
  );
}
