"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { copy } from "../content/copy";
import { developmentBuild } from "../build-profile";
import { unlockDevelopmentCatalogItems } from "../development/catalog-unlocks";
import type { Player } from "../domain/types";
import { LocalLoungeCanvas, type LoungeCanvasState } from "./LocalLoungeCanvas";
import { LoungeLoading } from "./LoungeLoading";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";
import {
  beachBoardwalkAssets,
  starlightTrainingCampAssets,
} from "./scene/assets";
import { useLoungeFullscreen } from "./use-lounge-fullscreen";

const DEVELOPMENT_LOADING_DURATION_MS = 5_000;

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
  const [settingsContainer, setSettingsContainer] =
    useState<HTMLDivElement | null>(null);
  const {
    active: fullscreenActive,
    bindContainer: bindFullscreenContainer,
    enter: enterFullscreen,
    exit: exitFullscreen,
  } = useLoungeFullscreen<HTMLElement>();
  const ownershipRetriesRef = useRef(0);
  const [developmentDelayElapsed, setDevelopmentDelayElapsed] =
    useState(!developmentBuild);
  const [scene, setScene] = useState<"beach" | "starlight">("beach");
  const [unlockState, setUnlockState] = useState<
    "idle" | "pending" | "done" | "error"
  >("idle");
  const sceneAssets =
    scene === "starlight" ? starlightTrainingCampAssets : beachBoardwalkAssets;
  const restartCanvas = useCallback(() => {
    if (developmentBuild) setDevelopmentDelayElapsed(false);
    setState("loading");
    setCanvasKey((key) => key + 1);
  }, []);
  const updateState = useCallback((next: LoungeCanvasState) => {
    if (next === "ownership-lost") {
      if (ownershipRetriesRef.current >= 1) {
        setState("error");
        return;
      }
      ownershipRetriesRef.current += 1;
      setState(next);
      return;
    }
    if (next === "ready") ownershipRetriesRef.current = 0;
    setState(next);
  }, []);

  useEffect(() => {
    if (!developmentBuild) return;
    const timer = window.setTimeout(
      () => setDevelopmentDelayElapsed(true),
      DEVELOPMENT_LOADING_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [canvasKey]);

  useEffect(() => {
    if (state !== "ownership-lost") return;
    const timer = window.setTimeout(restartCanvas, 250);
    return () => window.clearTimeout(timer);
  }, [restartCanvas, state]);

  const presentedState =
    developmentBuild && state === "ready" && !developmentDelayElapsed
      ? "loading"
      : state;

  return (
    <section
      ref={bindFullscreenContainer}
      className={`team-lounge${fullscreenActive ? " team-lounge--fullscreen" : ""}`}
      data-fullscreen={fullscreenActive || undefined}
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
        <div className="team-lounge__header-actions">
          <span className="team-lounge__presence">
            <span aria-hidden="true" />
            {unlocked ? `${presence} here` : copy.teamLounge.locked}
          </span>
          {unlocked && connected ? (
            <div
              ref={setSettingsContainer}
              className="team-lounge__header-settings"
            />
          ) : null}
          {unlocked ? (
            <button
              type="button"
              className="team-lounge__fullscreen"
              aria-pressed={fullscreenActive}
              aria-label={
                fullscreenActive
                  ? copy.teamLounge.exitFullscreen
                  : copy.teamLounge.enterFullscreen
              }
              onClick={() =>
                void (fullscreenActive ? exitFullscreen() : enterFullscreen())
              }
            >
              <span aria-hidden="true">{fullscreenActive ? "×" : "⛶"}</span>
            </button>
          ) : null}
        </div>
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
                  restartCanvas();
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
              void unlockDevelopmentCatalogItems()
                .then(() => {
                  setUnlockState("done");
                  restartCanvas();
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
        data-canvas-state={unlocked ? presentedState : "locked"}
        data-scene={scene}
      >
        {unlocked && state !== "superseded" && state !== "ownership-lost" ? (
          connected ? (
            <SharedLoungeCanvas
              key={canvasKey}
              teamID={teamID}
              player={player}
              roster={roster}
              assets={sceneAssets}
              settingsContainer={settingsContainer}
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
        ) : !unlocked ? (
          <div className="team-lounge__lock">
            <span className="team-lounge__lock-mark" aria-hidden="true">
              ◆
            </span>
            <h3>{copy.teamLounge.lockedTitle}</h3>
            <p>{copy.teamLounge.lockedDetail}</p>
            <Link href="/">{copy.teamLounge.lockedAction}</Link>
          </div>
        ) : null}
        {unlocked && presentedState === "superseded" ? (
          <div className="team-lounge__status" role="status">
            <p>{copy.teamLounge.openElsewhere}</p>
            <p>{copy.teamLounge.openElsewhereDetail}</p>
            <Link href="/">{copy.teamLounge.openElsewhereAction}</Link>
          </div>
        ) : unlocked && presentedState === "error" ? (
          <div className="team-lounge__status" role="alert">
            <p>{copy.teamLounge.unavailable}</p>
            <button type="button" onClick={restartCanvas}>
              {copy.teamLounge.retry}
            </button>
          </div>
        ) : unlocked &&
          (presentedState === "loading" ||
            presentedState === "ownership-lost") ? (
          <LoungeLoading
            label={copy.teamLounge.loading}
            overlay
            scene={scene}
          />
        ) : unlocked && presentedState !== "ready" ? (
          <p className="team-lounge__status" aria-live="polite">
            {copy.teamLounge.static}
          </p>
        ) : null}
      </div>
    </section>
  );
}
