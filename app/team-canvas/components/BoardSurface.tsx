"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { useState } from "react";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { teamCanvasCopy } from "../content";
import { teamCanvasMock } from "../mock-data";
import type { BoardPosition, EmojiDraft, EmojiPlacement } from "../model";

export function BoardSurface({
  starCount,
  avatarPosition,
  emojiDraft,
  emojiPlacements,
  textStyle,
  onMoveAvatar,
  onMoveEmoji,
}: {
  starCount: number;
  avatarPosition: BoardPosition;
  emojiDraft: EmojiDraft | null;
  emojiPlacements: EmojiPlacement[];
  textStyle: string;
  onMoveAvatar(position: BoardPosition): void;
  onMoveEmoji(position: BoardPosition): void;
}) {
  const [dragging, setDragging] = useState<"avatar" | "emoji" | null>(null);
  const copy = teamCanvasCopy.board;

  const moveFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
    if (dragging === "avatar") onMoveAvatar(position);
    else onMoveEmoji(position);
  };

  return (
    <div
      className={`tc-board tc-board--${textStyle}`}
      aria-label={copy.canvasLabel}
      onPointerMove={moveFromPointer}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
    >
      <span className="tc-board__team-name" aria-hidden="true">
        HILL
        <br />
        STRIDERS
      </span>

      {teamCanvasMock.lockedStamps.map((stamp) => (
        <LockedStamp
          key={stamp.id}
          placement={{ ...stamp, dayKey: "team", locked: true }}
        />
      ))}
      {emojiPlacements.map((placement) => (
        <LockedStamp key={placement.id} placement={placement} />
      ))}

      {teamCanvasMock.completers.map((player) => (
        <PlayerMarker
          key={player.id}
          name={player.name}
          initials={player.initials}
          color={player.color}
          x={player.x}
          y={player.y}
          stars={player.stars}
        />
      ))}

      <PlayerMarker
        name="Mason"
        initials="MC"
        color={teamCanvasMock.player.avatarColor}
        x={avatarPosition.x}
        y={avatarPosition.y}
        stars={starCount}
        current
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDragging("avatar");
        }}
        onKeyDown={(event) =>
          moveAvatarWithKeyboard(event, avatarPosition, onMoveAvatar)
        }
      />

      {emojiDraft ? (
        <button
          className="tc-stamp tc-stamp--draft"
          type="button"
          aria-label="Move stamp"
          style={positionStyle(emojiDraft)}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging("emoji");
          }}
        >
          {emojiDraft.emoji}
        </button>
      ) : null}
    </div>
  );
}

function PlayerMarker({
  name,
  initials,
  color,
  x,
  y,
  stars,
  current = false,
  onPointerDown,
  onKeyDown,
}: {
  name: string;
  initials: string;
  color: string;
  x: number;
  y: number;
  stars: number;
  current?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const marker = (
    <>
      {current ? (
        <span className="tc-player-avatar tc-player-avatar--art">
          <PlayerAvatar
            player={teamCanvasMock.player}
            size="medium"
            emphasizeSelf={false}
          />
        </span>
      ) : (
        <span className="tc-player-avatar" style={{ background: color }}>
          {initials}
        </span>
      )}
      <span className="tc-player-name">{name}</span>
      <span
        className="tc-player-stars"
        aria-label={`${name} has ${stars} ${stars === 1 ? "star" : "stars"} this week`}
      >
        <span aria-hidden="true">★</span> {stars}
      </span>
    </>
  );

  const style = { left: `${x}%`, top: `${y}%` };
  return current ? (
    <button
      className="tc-player tc-player--current"
      type="button"
      style={style}
      aria-label={`Move ${name}’s avatar`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      {marker}
    </button>
  ) : (
    <div className="tc-player" style={style}>
      {marker}
    </div>
  );
}

function LockedStamp({ placement }: { placement: EmojiPlacement }) {
  return (
    <span
      className="tc-stamp tc-stamp--locked"
      style={positionStyle(placement)}
      aria-hidden="true"
    >
      {placement.emoji}
    </span>
  );
}

function positionStyle(placement: EmojiDraft): React.CSSProperties {
  return {
    left: `${placement.x}%`,
    top: `${placement.y}%`,
    fontSize: `${placement.size}px`,
    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
  };
}

function moveAvatarWithKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  current: BoardPosition,
  move: (position: BoardPosition) => void,
) {
  const directions: Record<string, BoardPosition> = {
    ArrowLeft: { x: -3, y: 0 },
    ArrowRight: { x: 3, y: 0 },
    ArrowUp: { x: 0, y: -3 },
    ArrowDown: { x: 0, y: 3 },
  };
  const delta = directions[event.key];
  if (!delta) return;
  event.preventDefault();
  move({ x: current.x + delta.x, y: current.y + delta.y });
}
