"use client";

import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  PointerEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import type { AvatarConfiguration } from "../../avatar/types";
import { Avatar } from "../../components/Avatar";
import type { Player } from "../../domain/types";
import {
  avatarReleaseVelocity,
  stepAvatarMomentum,
  type AvatarMotionSample,
} from "../avatar-momentum";
import {
  gestureTransform,
  isPointInTrashDropZone,
  starCrownLayout,
  topAnchoredResize,
  type GesturePoint,
} from "../board-geometry";
import { teamCanvasCopy } from "../content";
import { teamCanvasBackground } from "../catalog";
import { liveTeamFrame } from "../live-simulation";
import { teamCanvasMock } from "../mock-data";
import type {
  BoardPosition,
  BoardTransform,
  ProjectedBoardPiece,
} from "../model";
import { StampAssetView, stampAssetLabel } from "./StampAsset";

interface BoardSurfaceProps {
  teamName: string;
  currentPlayerID: string;
  members: BoardMember[];
  pieces: ProjectedBoardPiece[];
  selectedPieceId: string | null;
  textStyle: string;
  backgroundAssetID: string;
  backgroundColor: string;
  textColor: string;
  textSize: number;
  simulatePeers: boolean;
  onMoveAvatar(position: BoardPosition): void;
  onTogglePiece(pieceId: string): void;
  onEditPiece(pieceId: string, patch: Partial<BoardTransform>): void;
  onDeletePiece(pieceId: string): void;
  onClearPiece(): void;
  reducedMotion?: boolean;
}

export interface BoardMember {
  player: Player;
  avatar: AvatarConfiguration;
  position: BoardPosition;
  starDayKeys: string[];
}

interface ActiveGesture {
  pieceId: string;
  base: BoardTransform;
  start: Map<number, GesturePoint>;
  current: Map<number, GesturePoint>;
  moved: boolean;
}

export function BoardSurface({
  teamName,
  currentPlayerID,
  members,
  pieces,
  selectedPieceId,
  textStyle,
  backgroundAssetID,
  backgroundColor,
  textColor,
  textSize,
  simulatePeers,
  onMoveAvatar,
  onTogglePiece,
  onEditPiece,
  onDeletePiece,
  onClearPiece,
  reducedMotion,
}: BoardSurfaceProps) {
  const [liveTick, setLiveTick] = useState(0);
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null);
  const [trashArmed, setTrashArmed] = useState(false);
  const avatarPointer = useRef<number | null>(null);
  const avatarSamples = useRef<AvatarMotionSample[]>([]);
  const avatarMomentumFrame = useRef<number | null>(null);
  const gesture = useRef<ActiveGesture | null>(null);
  const suppressPieceClick = useRef(false);
  const copy = teamCanvasCopy.board;
  const liveFrame = liveTeamFrame(liveTick);
  const currentMember = members.find(
    ({ player }) => player.id === currentPlayerID,
  );
  const background = teamCanvasBackground(backgroundAssetID);
  const boardStyle = {
    "--tc-board-color": backgroundColor,
    "--tc-board-image": background ? `url("${background}")` : "none",
    "--tc-board-text-color": textColor,
    "--tc-board-text-size": `${textSize}px`,
  } as CSSProperties;
  const deletePiece = (pieceId: string) => {
    gesture.current = null;
    setDraggingPieceId(null);
    setTrashArmed(false);
    onDeletePiece(pieceId);
  };
  const stopAvatarMomentum = () => {
    if (avatarMomentumFrame.current !== null) {
      window.cancelAnimationFrame(avatarMomentumFrame.current);
      avatarMomentumFrame.current = null;
    }
  };
  const beginAvatarMomentum = (
    position: BoardPosition,
    samples: AvatarMotionSample[],
  ) => {
    stopAvatarMomentum();
    if (
      reducedMotion ??
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let momentum = {
      position,
      velocity: avatarReleaseVelocity(samples),
    };
    if (Math.hypot(momentum.velocity.x, momentum.velocity.y) === 0) return;
    let lastFrame = performance.now();
    const advance = (now: number) => {
      momentum = stepAvatarMomentum(momentum, (now - lastFrame) / 1000);
      lastFrame = now;
      onMoveAvatar(momentum.position);
      if (Math.hypot(momentum.velocity.x, momentum.velocity.y) === 0) {
        avatarMomentumFrame.current = null;
        return;
      }
      avatarMomentumFrame.current = window.requestAnimationFrame(advance);
    };
    avatarMomentumFrame.current = window.requestAnimationFrame(advance);
  };
  useEffect(
    () => () => {
      if (avatarMomentumFrame.current !== null) {
        window.cancelAnimationFrame(avatarMomentumFrame.current);
      }
    },
    [],
  );
  useEffect(() => {
    if (!simulatePeers) return;
    const reduced =
      reducedMotion ??
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(
      () => setLiveTick((tick) => tick + 1),
      680,
    );
    return () => window.clearInterval(timer);
  }, [reducedMotion, simulatePeers]);

  return (
    <div
      className={`tc-board tc-board--${textStyle} tc-board-bg--${backgroundAssetID}`}
      style={boardStyle}
      aria-label={copy.canvasLabel}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClearPiece();
      }}
    >
      <span className="tc-board__team-name" aria-hidden="true">
        {teamName.toUpperCase().replace(/\s+/g, "\n")}
      </span>
      <span className="tc-live-indicator">
        <span aria-hidden="true" /> {copy.liveNow}
      </span>
      <span
        className={`tc-trash-target${draggingPieceId ? " is-visible" : ""}${trashArmed ? " is-armed" : ""}`}
        aria-label={copy.trashTarget}
      >
        <span className="tc-trash-target__icon" aria-hidden="true" />
      </span>

      {simulatePeers
        ? teamCanvasMock.pastedPieces.map((piece) => (
            <StaticStamp key={physicsPieceKey(piece)} piece={piece} />
          ))
        : null}
      {simulatePeers
        ? liveFrame.pieces.map((piece) => (
            <StaticStamp key={physicsPieceKey(piece)} piece={piece} peerLive />
          ))
        : null}
      {pieces
        .filter(({ editable }) => !editable)
        .map((piece) => (
          <StaticStamp
            key={physicsPieceKey(piece)}
            piece={piece}
            peerLive={piece.status === "live"}
          />
        ))}

      {members
        .filter(({ player }) => player.id !== currentPlayerID)
        .map((member) => {
          const livePosition = liveFrame.players.find(
            ({ id }) => id === member.player.id,
          );
          return (
            <PlayerMarker
              key={member.player.id}
              player={member.player}
              avatar={member.avatar}
              x={
                simulatePeers
                  ? (livePosition?.x ?? member.position.x)
                  : member.position.x
              }
              y={
                simulatePeers
                  ? (livePosition?.y ?? member.position.y)
                  : member.position.y
              }
              starDayKeys={[...member.starDayKeys]}
              live
            />
          );
        })}

      {currentMember ? (
        <PlayerMarker
          player={currentMember.player}
          avatar={currentMember.avatar}
          x={currentMember.position.x}
          y={currentMember.position.y}
          starDayKeys={currentMember.starDayKeys}
          current
          onPointerDown={(event) => {
            event.preventDefault();
            stopAvatarMomentum();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            avatarPointer.current = event.pointerId;
            avatarSamples.current = [
              {
                position: currentMember.position,
                at: event.timeStamp,
              },
            ];
          }}
          onPointerMove={(event) => {
            if (avatarPointer.current !== event.pointerId) return;
            const position = avatarPositionFromPointer(event);
            if (!position) return;
            onMoveAvatar(position);
            avatarSamples.current = recentAvatarSamples([
              ...avatarSamples.current,
              { position, at: event.timeStamp },
            ]);
          }}
          onPointerUp={(event) => {
            if (avatarPointer.current !== event.pointerId) return;
            const position =
              avatarPositionFromPointer(event) ?? currentMember.position;
            const samples = recentAvatarSamples([
              ...avatarSamples.current,
              { position, at: event.timeStamp },
            ]);
            avatarPointer.current = null;
            avatarSamples.current = [];
            beginAvatarMomentum(position, samples);
          }}
          onPointerCancel={() => {
            avatarPointer.current = null;
            avatarSamples.current = [];
          }}
          onKeyDown={(event) =>
            moveAvatarWithKeyboard(event, currentMember.position, onMoveAvatar)
          }
        />
      ) : null}

      {pieces
        .filter(({ editable }) => editable)
        .map((piece) => {
          const selected = piece.id === selectedPieceId;
          const label = stampAssetLabel(piece.asset);
          return (
            <div
              key={physicsPieceKey(piece)}
              className={`tc-stamp-orbit${piece.physics ? " tc-stamp-orbit--physics" : ""}${piece.physics?.resetCount ? " tc-stamp--physics-reset" : ""}${piece.physics?.recovering ? " tc-stamp--recovering" : ""}${selected ? " is-selected" : " is-resting"}`}
              style={orbitStyle(piece)}
            >
              <button
                className="tc-stamp tc-stamp--owned-live"
                type="button"
                aria-label={copy.editStamp(label)}
                aria-pressed={selected}
                style={ownedStampStyle(piece)}
                onClick={() => {
                  if (suppressPieceClick.current) {
                    suppressPieceClick.current = false;
                    return;
                  }
                  onTogglePiece(piece.id);
                }}
                onPointerDown={(event) => {
                  if (!selected) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  beginGesture(event, piece, gesture);
                  setTrashArmed(false);
                }}
                onPointerMove={(event) => {
                  const result = continueGesture(event, gesture, onEditPiece);
                  if (!result?.moved) return;
                  setDraggingPieceId(piece.id);
                  setTrashArmed(result.trashArmed);
                }}
                onPointerUp={(event) => {
                  const active = gesture.current;
                  if (active?.moved && active.current.size === 1) {
                    const board = event.currentTarget.closest(".tc-board");
                    if (
                      board instanceof HTMLElement &&
                      isTrashDropPoint(pointerPoint(event), board)
                    ) {
                      suppressPieceClick.current = true;
                      deletePiece(piece.id);
                      return;
                    }
                  }
                  const ended = endGesture(
                    event,
                    piece,
                    gesture,
                    suppressPieceClick,
                  );
                  if (ended) {
                    setDraggingPieceId(null);
                    setTrashArmed(false);
                  }
                }}
                onPointerCancel={(event) => {
                  const ended = endGesture(
                    event,
                    piece,
                    gesture,
                    suppressPieceClick,
                  );
                  if (ended) {
                    setDraggingPieceId(null);
                    setTrashArmed(false);
                  }
                }}
                onKeyDown={(event) =>
                  editPieceWithKeyboard(
                    event,
                    piece,
                    onEditPiece,
                    deletePiece,
                    onClearPiece,
                  )
                }
              >
                <StampAssetView asset={piece.asset} />
              </button>
              {selected ? (
                <StampOrbitControls piece={piece} onEditPiece={onEditPiece} />
              ) : null}
            </div>
          );
        })}
    </div>
  );
}

function PlayerMarker({
  player,
  avatar,
  x,
  y,
  starDayKeys,
  current = false,
  live = false,
  ...events
}: {
  player: Player;
  avatar: AvatarConfiguration;
  x: number;
  y: number;
  starDayKeys: string[];
  current?: boolean;
  live?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const marker = (
    <>
      <StarCrown name={player.firstName} dayKeys={starDayKeys} />
      <span className="tc-player-avatar">
        <Avatar player={player} config={avatar} size="medium" />
      </span>
      <span className="tc-player-name">{player.firstName}</span>
    </>
  );
  const style = { left: `${x}%`, top: `${y}%` };

  return current ? (
    <button
      className="tc-player tc-player--current"
      type="button"
      style={style}
      aria-label={teamCanvasCopy.board.moveAvatar(player.firstName)}
      {...events}
    >
      {marker}
    </button>
  ) : (
    <div className={`tc-player${live ? " tc-player--live" : ""}`} style={style}>
      {marker}
    </div>
  );
}

function StarCrown({ name, dayKeys }: { name: string; dayKeys: string[] }) {
  return (
    <span
      className="tc-star-crown"
      aria-label={teamCanvasCopy.board.completedDays(name)}
    >
      {dayKeys.map((dayKey, index) => {
        const point = starCrownLayout(dayKeys.length)[index];
        return (
          <span
            key={dayKey}
            className="tc-star-crown__star"
            data-testid={`${name}-star`}
            aria-hidden="true"
            style={{
              left: `${point.left}%`,
              top: `${point.top}%`,
            }}
          >
            ★
          </span>
        );
      })}
    </span>
  );
}

function StaticStamp({
  piece,
  peerLive = false,
}: {
  piece: ProjectedBoardPiece;
  peerLive?: boolean;
}) {
  return (
    <span
      className={`tc-stamp ${peerLive ? "tc-stamp--peer-live" : "tc-stamp--pasted"}${piece.physics ? " tc-stamp--physics" : ""}${piece.physics?.resetCount ? " tc-stamp--physics-reset" : ""}${piece.physics?.recovering ? " tc-stamp--recovering" : ""}`}
      style={positionStyle(piece)}
      aria-hidden="true"
    >
      <StampAssetView asset={piece.asset} />
    </span>
  );
}

function physicsPieceKey(piece: ProjectedBoardPiece) {
  return `${piece.id}-${piece.physics?.resetCount ?? 0}`;
}

function StampOrbitControls({
  piece,
  onEditPiece,
}: {
  piece: ProjectedBoardPiece;
  onEditPiece(pieceId: string, patch: Partial<BoardTransform>): void;
}) {
  const copy = teamCanvasCopy.board;
  return (
    <div className="tc-orbit-controls" aria-label={copy.paletteLabel}>
      <button
        className="tc-orbit-control tc-orbit-control--smaller"
        type="button"
        aria-label={copy.smaller}
        onClick={(event) =>
          resizePieceFromTop(event, piece, piece.size - 6, onEditPiece)
        }
      >
        −
      </button>
      <button
        className="tc-orbit-control tc-orbit-control--larger"
        type="button"
        aria-label={copy.larger}
        onClick={(event) =>
          resizePieceFromTop(event, piece, piece.size + 6, onEditPiece)
        }
      >
        ＋
      </button>
      <button
        className="tc-orbit-control tc-orbit-control--rotate-left"
        type="button"
        aria-label={copy.rotateLeft}
        onClick={() => onEditPiece(piece.id, { rotation: piece.rotation - 12 })}
      />
      <button
        className="tc-orbit-control tc-orbit-control--rotate-right"
        type="button"
        aria-label={copy.rotateRight}
        onClick={() => onEditPiece(piece.id, { rotation: piece.rotation + 12 })}
      />
      <span
        className="tc-rotation-arrow tc-rotation-arrow--left"
        aria-hidden="true"
      >
        <span className="tc-rotation-arrow__head" />
      </span>
      <span
        className="tc-rotation-arrow tc-rotation-arrow--right"
        aria-hidden="true"
      >
        <span className="tc-rotation-arrow__head" />
      </span>
    </div>
  );
}

function beginGesture(
  event: PointerEvent<HTMLButtonElement>,
  piece: ProjectedBoardPiece,
  gestureRef: MutableRefObject<ActiveGesture | null>,
) {
  const point = pointerPoint(event);
  const existing = gestureRef.current;
  const current =
    existing?.pieceId === piece.id
      ? new Map(existing.current)
      : new Map<number, GesturePoint>();
  current.set(event.pointerId, point);
  gestureRef.current = {
    pieceId: piece.id,
    base: transformOf(piece),
    start: new Map(current),
    current,
    moved: existing?.moved ?? false,
  };
}

function continueGesture(
  event: PointerEvent<HTMLButtonElement>,
  gestureRef: MutableRefObject<ActiveGesture | null>,
  edit: (pieceId: string, patch: Partial<BoardTransform>) => void,
) {
  const active = gestureRef.current;
  if (!active?.current.has(event.pointerId)) return;
  active.current.set(event.pointerId, pointerPoint(event));
  active.moved ||= [...active.current].some(([id, point]) => {
    const origin = active.start.get(id);
    return origin
      ? Math.hypot(point.x - origin.x, point.y - origin.y) > 3
      : false;
  });
  const board = event.currentTarget.closest(".tc-board");
  if (!(board instanceof HTMLElement)) return;
  const rect = board.getBoundingClientRect();
  edit(
    active.pieceId,
    gestureTransform(
      active.base,
      [...active.start.values()],
      [...active.current.values()],
      rect,
    ),
  );
  return {
    moved: active.moved,
    trashArmed:
      active.moved && active.current.size === 1
        ? isTrashDropPoint(pointerPoint(event), board)
        : false,
  };
}

function endGesture(
  event: PointerEvent<HTMLButtonElement>,
  piece: ProjectedBoardPiece,
  gestureRef: MutableRefObject<ActiveGesture | null>,
  suppressClick: MutableRefObject<boolean>,
) {
  const active = gestureRef.current;
  if (!active?.current.has(event.pointerId)) return false;
  suppressClick.current ||= active.moved;
  active.current.delete(event.pointerId);
  if (active.current.size === 0) {
    gestureRef.current = null;
    return true;
  }
  gestureRef.current = {
    ...active,
    base: transformOf(piece),
    start: new Map(active.current),
    moved: false,
  };
  return false;
}

function pointerPoint(event: PointerEvent<HTMLElement>): GesturePoint {
  return { id: event.pointerId, x: event.clientX, y: event.clientY };
}

function avatarPositionFromPointer(
  event: PointerEvent<HTMLElement>,
): BoardPosition | null {
  const board = event.currentTarget.closest(".tc-board");
  if (!(board instanceof HTMLElement)) return null;
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 6, 94),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 6, 94),
  };
}

function recentAvatarSamples(samples: AvatarMotionSample[]) {
  const latest = samples.at(-1)?.at ?? 0;
  return samples.filter(({ at }) => at >= latest - 120).slice(-6);
}

function isTrashDropPoint(point: GesturePoint, board: HTMLElement) {
  if (isPointInTrashDropZone(point, board.getBoundingClientRect())) return true;
  const target = board.querySelector(".tc-trash-target");
  if (!(target instanceof HTMLElement)) return false;
  const rect = target.getBoundingClientRect();
  return (
    Math.hypot(
      point.x - (rect.left + rect.width / 2),
      point.y - (rect.top + rect.height / 2),
    ) <=
    Math.max(rect.width, rect.height) * 0.75
  );
}

function transformOf(piece: ProjectedBoardPiece): BoardTransform {
  return {
    x: piece.x,
    y: piece.y,
    size: piece.size,
    rotation: piece.rotation,
  };
}

function positionStyle(piece: BoardTransform): CSSProperties {
  return {
    left: `${piece.x}%`,
    top: `${piece.y}%`,
    fontSize: `${piece.size}px`,
    transform: `translate(-50%, -50%) rotate(${piece.rotation}deg)`,
  };
}

function orbitStyle(piece: BoardTransform): CSSProperties {
  return {
    left: `${piece.x}%`,
    top: `${piece.y}%`,
    width: `${piece.size + 30}px`,
    height: `${piece.size + 30}px`,
  };
}

function ownedStampStyle(piece: BoardTransform): CSSProperties {
  return {
    width: `${piece.size}px`,
    height: `${piece.size}px`,
    fontSize: `${piece.size}px`,
    transform: `translate(-50%, -50%) rotate(${piece.rotation}deg)`,
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

function editPieceWithKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  piece: ProjectedBoardPiece,
  edit: (pieceId: string, patch: Partial<BoardTransform>) => void,
  deletePiece: (pieceId: string) => void,
  clear: () => void,
) {
  const movement: Record<string, Partial<BoardTransform>> = {
    ArrowLeft: { x: piece.x - 3 },
    ArrowRight: { x: piece.x + 3 },
    ArrowUp: { y: piece.y - 3 },
    ArrowDown: { y: piece.y + 3 },
    "[": { rotation: piece.rotation - 8 },
    "]": { rotation: piece.rotation + 8 },
  };
  if (event.key === "Escape") {
    event.preventDefault();
    clear();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deletePiece(piece.id);
    return;
  }
  const sizeDelta = { "+": 4, "=": 4, "-": -4 }[event.key];
  if (sizeDelta) {
    event.preventDefault();
    resizePieceFromTop(event, piece, piece.size + sizeDelta, edit);
    return;
  }
  const patch = movement[event.key];
  if (!patch) return;
  event.preventDefault();
  edit(piece.id, patch);
}

function resizePieceFromTop(
  event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>,
  piece: ProjectedBoardPiece,
  size: number,
  edit: (pieceId: string, patch: Partial<BoardTransform>) => void,
) {
  const board = event.currentTarget.closest(".tc-board");
  const boardHeight =
    board instanceof HTMLElement ? board.getBoundingClientRect().height : 0;
  edit(piece.id, topAnchoredResize(piece, size, boardHeight));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
