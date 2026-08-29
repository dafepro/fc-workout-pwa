"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { copy } from "../content/copy";
import { developmentBuild } from "../build-profile";
import type { Player } from "../domain/types";
import { LocalLoungeCanvas, type LoungeCanvasState } from "./LocalLoungeCanvas";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";
import { unlockDevelopmentLoungeItems } from "./lounge-development";
import {
  beachBoardwalkAssets,
  starlightTrainingCampAssets,
} from "./scene/assets";

export function TeamLounge({
  player,
  unlocked,
  connected = false,
  teamID = "team-hill-striders",
  roster = [player],
}: {
  player: Player;
  unlocked: boolean;
  connected?: boolean;
  teamID?: string;
  roster?: readonly Player[];
}) {
  const [state, setState] = useState<LoungeCanvasState>("loading");
  const [presence, setPresence] = useState(1);
  const [canvasKey, setCanvasKey] = useState(0);
  const [scene, setScene] = useState<"beach" | "starlight">("beach");
  const [unlockState, setUnlockState] = useState<
    "idle" | "pending" | "done" | "error"
  >("idle");
  const sceneAssets =
    scene === "starlight" ? starlightTrainingCampAssets : beachBoardwalkAssets;
  const updateState = useCallback(
    (next: LoungeCanvasState) => setState(next),
    [],
  );

  return (
    <section
      className="team-lounge"
      role="region"
      aria-label={copy.teamLounge.regionLabel}
    >
      <header className="team-lounge__header">
        <div>
          <p>{copy.teamLounge.label}</p>
          <h2>
            <span>{copy.teamLounge.period}</span>
            {copy.teamLounge.theme}
          </h2>
        </div>
        <span className="team-lounge__presence">
          <span aria-hidden="true" />
          {unlocked ? `${presence} here` : copy.teamLounge.locked}
        </span>
      </header>
      {developmentBuild && unlocked ? (
        <div
          className="team-lounge__dev-tools"
          aria-label={copy.teamLounge.development.label}
        >
          <div role="group" aria-label="Scene preview">
            {(["beach", "starlight"] as const).map((nextScene) => (
              <button
                key={nextScene}
                type="button"
                aria-pressed={scene === nextScene}
                onClick={() => {
                  setScene(nextScene);
                  setCanvasKey((key) => key + 1);
                }}
              >
                {copy.teamLounge.development[nextScene]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={unlockState === "pending"}
            onClick={() => {
              setUnlockState("pending");
              void unlockDevelopmentLoungeItems()
                .then(() => {
                  setUnlockState("done");
                  setCanvasKey((key) => key + 1);
                })
                .catch(() => setUnlockState("error"));
            }}
          >
            {unlockState === "pending"
              ? copy.teamLounge.development.unlocking
              : copy.teamLounge.development.unlock}
          </button>
          {unlockState === "done" ? (
            <span>{copy.teamLounge.development.unlocked}</span>
          ) : null}
          {unlockState === "error" ? (
            <span role="alert">{copy.teamLounge.development.failed}</span>
          ) : null}
        </div>
      ) : null}
      <div
        className={`team-lounge__world${unlocked ? "" : " team-lounge__world--locked"}`}
        data-canvas-state={unlocked ? state : "locked"}
        data-scene={scene}
      >
        {unlocked ? (
          connected ? (
            <SharedLoungeCanvas
              key={canvasKey}
              teamID={teamID}
              player={player}
              roster={roster}
              assets={sceneAssets}
              onStateChange={updateState}
              onPresenceChange={setPresence}
            />
          ) : (
            <div className="team-lounge__playfield">
              <LocalLoungeCanvas
                key={canvasKey}
                player={player}
                assets={sceneAssets}
                onStateChange={updateState}
              />
            </div>
          )
        ) : (
          <div className="team-lounge__lock">
            <span className="team-lounge__lock-mark" aria-hidden="true">
              ◆
            </span>
            <h3>{copy.teamLounge.lockedTitle}</h3>
            <p>{copy.teamLounge.lockedDetail}</p>
            <Link href="/">{copy.teamLounge.lockedAction}</Link>
          </div>
        )}
        {unlocked && state === "error" ? (
          <div className="team-lounge__status" role="alert">
            <p>{copy.teamLounge.unavailable}</p>
            <button
              type="button"
              onClick={() => {
                setState("loading");
                setCanvasKey((key) => key + 1);
              }}
            >
              {copy.teamLounge.retry}
            </button>
          </div>
        ) : unlocked && state !== "ready" ? (
          <p className="team-lounge__status" aria-live="polite">
            {state === "loading"
              ? copy.teamLounge.loading
              : copy.teamLounge.static}
          </p>
        ) : null}
      </div>
    </section>
  );
}
