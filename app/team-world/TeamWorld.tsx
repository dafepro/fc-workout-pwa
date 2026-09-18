"use client";
import {
  loadInteractiveProps,
  type ItemAction,
} from "./adapters/interactive-props";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { developmentBuild } from "../build-profile";
import { installMotionRecorder } from "./motion-recorder";
import { DevControls } from "./DevControls";
import {
  normalRendering,
  readRenderSettings,
  renderSettingsKey,
  createRenderDiagnostics,
  renderReport,
  type RenderSettings,
} from "./diagnostics";
import { useFullscreen } from "../components/use-fullscreen";
import {
  Zoomap,
  cannonBehavior,
  switchBehavior,
  performanceUsable,
  type ToolId,
  type WorldMap,
  type ConnectionState,
} from "zmap";
import { loadActionKit } from "./adapters/characters";
import { loadCannonKit } from "./adapters/cannon";
import { loadCampus } from "./adapters/campus";
import {
  createNavigationControls,
  type MovementMode,
} from "./adapters/navigation";
import { requestWorldTicket } from "./gateway";
import { soccerBehavior, pitchState } from "./soccer.mjs";
import { createSoccerVisuals } from "./adapters/soccer";
import mapJSON from "./world.json";
import { worldCopy as copy } from "./copy";
import "./world.css";
import { renderPixelRatio } from "./render-budget";
const map = mapJSON as unknown as WorldMap;
function setCameraZoom(world: Zoomap, zoom: number) {
  world.view.camera.zoom = zoom;
  world.view.camera.updateProjectionMatrix();
}
export default function TeamWorld({ teamID }: { teamID: string }) {
  const {
    active: fullscreen,
    bindContainer: bindViewport,
    enter: enterFullscreen,
    exit: exitFullscreen,
  } = useFullscreen<HTMLDivElement>();
  const [zoom, setZoom] = useState(2);
  const [debugSettings, setDebugSettings] = useState<RenderSettings>({
    ...normalRendering,
  });
  const debugRef = useRef(debugSettings);
  const updateDebug = (next: RenderSettings) => {
    debugRef.current = next;
    setDebugSettings(next);
    try {
      localStorage.setItem(renderSettingsKey, JSON.stringify(next));
    } catch {
      /* Live controls also work without storage. */
    }
  };
  useEffect(() => {
    if (!developmentBuild) return;
    const frame = requestAnimationFrame(() =>
      updateDebug(readRenderSettings()),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const container = useRef<HTMLDivElement>(null),
    stick = useRef<HTMLDivElement>(null),
    hint = useRef<HTMLSpanElement>(null),
    stop = useRef<HTMLButtonElement>(null),
    sprint = useRef<HTMLButtonElement>(null);
  const world = useRef<Zoomap | null>(null),
    navigation = useRef<ReturnType<typeof createNavigationControls> | null>(
      null,
    );
  const [status, setStatus] = useState<ConnectionState>("connecting"),
    [failed, setFailed] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [people, setPeople] = useState(0),
    [mode, setMode] = useState<MovementMode>("joystick");
  const readDebug = useCallback(
    (capture = false) => renderReport(world.current, debugRef.current, capture),
    [],
  );
  const [itemActions, setItemActions] = useState<ItemAction[]>([]);
  const [toolReady, setToolReady] = useState(false);
  const [selectedTool, setSelectedTool] = useState("");
  const [score, setScore] = useState({
    pitch: "main-pitch",
    burgundy: 0,
    gold: 0,
  });
  const [drawn, setDrawn] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const debug = developmentBuild
      ? createRenderDiagnostics(() => debugRef.current)
      : undefined;
    let recorder: ReturnType<typeof installMotionRecorder> | undefined;
    let viewportObserver: ResizeObserver | undefined;
    let controlsTimer: ReturnType<typeof setInterval> | undefined;
    let kit: Awaited<ReturnType<typeof loadActionKit>> | undefined;
    let cannon: Awaited<ReturnType<typeof loadCannonKit>> | undefined;
    let props: Awaited<ReturnType<typeof loadInteractiveProps>> | undefined;
    let campus: Awaited<ReturnType<typeof loadCampus>> | undefined;
    const soccer = createSoccerVisuals(map);
    let current: Zoomap | undefined;
    let movement: ReturnType<typeof createNavigationControls> | undefined;
    const controller = new AbortController();
    const dispose = () => {
      clearInterval(controlsTimer);
      viewportObserver?.disconnect();
      movement?.dispose();
      campus?.dispose();
      soccer.dispose();
      recorder?.dispose();
      current?.dispose();
      debug?.dispose();
      cannon?.dispose();
      props?.dispose();
      kit?.dispose();
    };
    void (async () => {
      const ticket = await requestWorldTicket(teamID, controller.signal);
      if (cancelled) return;
      kit = await loadActionKit(
        () => {
          if (!cancelled) {
            setFailed(copy.unavailable);
            current?.setInputEnabled(false);
          }
        },
        undefined,
        () => debugRef.current,
      );
      if (cancelled) {
        dispose();
        return;
      }
      cannon = await loadCannonKit(map);
      if (cancelled) {
        dispose();
        return;
      }
      props = await loadInteractiveProps(map);
      if (cancelled) {
        dispose();
        return;
      }
      campus = await loadCampus(
        controller.signal,
        () => !developmentBuild || debugRef.current.silhouette,
      );
      await soccer.load(controller.signal);
      if (cancelled) {
        dispose();
        return;
      }
      current = new Zoomap({
        container: container.current!,
        map,
        catalog: [],
        objectBehaviors: [cannonBehavior, switchBehavior, soccerBehavior],
        visuals: {
          character: (identity) => {
            const character = kit!.character(identity);
            return debug?.character(character) ?? character;
          },
          toy: soccer.toy,
          scenery: (scene, m) => {
            kit!.scenery(scene, m);
            campus!.scenery(scene);
            cannon!.scenery(scene);
            props!.scenery(scene);
            soccer.scenery(scene);
          },
          frame: (context) => {
            soccer.frame(context);
            cannon!.frame(context);
            props!.frame(context);
            if (debug && current) {
              campus!.setVisible(debugRef.current.campus);
              debug.frame(current);
            }
          },
        },
        onStatus: (s) => {
          if (!cancelled) setStatus(s);
        },
        onChange: () => {
          if (!cancelled) setPeople(current?.roster.length ?? 0);
        },
      });
      world.current = current;
      if (developmentBuild) recorder = installMotionRecorder(current);
      const resizeBudget = () => {
        if (cancelled || !current || !container.current) return;
        const ratio =
          renderPixelRatio(
            container.current.clientWidth,
            container.current.clientHeight,
            devicePixelRatio,
          ) * (developmentBuild ? Number(debugRef.current.resolution) : 1);
        if (Math.abs(current.view.renderer.getPixelRatio() - ratio) > 0.001)
          current.view.renderer.setPixelRatio(ratio);
      };
      viewportObserver = new ResizeObserver(resizeBudget);
      viewportObserver.observe(container.current!);
      resizeBudget();
      let previousActions = "",
        previousScore = "";
      controlsTimer = setInterval(() => {
        const pitches = map.objects!.filter((o) => o.behavior === "soccer");
        const local = current?.local ?? map.spawn;
        const pitch = pitches.sort(
          (a, b) =>
            Math.hypot(a.position.x - local.x, a.position.z - local.z) -
            Math.hypot(b.position.x - local.x, b.position.z - local.z),
        )[0];
        const value = current?.state.objects?.instances[pitch.id];
        if (value) {
          const s = pitchState(value),
            key = `${pitch.id}:${s.burgundy}:${s.gold}`;
          if (key !== previousScore) {
            previousScore = key;
            setScore({ pitch: pitch.id, burgundy: s.burgundy, gold: s.gold });
          }
        }
        const actions = props!.actions(current!);
        const key = JSON.stringify(actions);
        if (key !== previousActions) {
          previousActions = key;
          setItemActions(actions);
        }
        const action = current?.state.actions?.players[current.session];
        setSelectedTool(action?.tool ?? "");
        setDrawn(action?.performance?.drawn ?? true);
        setToolReady(
          !!action?.tool &&
            !kit?.isPreparing() &&
            action.performance?.drawn !== false &&
            performanceUsable(action.performance, current!.state.tick),
        );
      }, 100);
      current.view.camera.zoom = 2;
      current.view.camera.updateProjectionMatrix();
      movement = createNavigationControls(current, map, {
        stick: stick.current!,
        status: hint.current!,
        stop: stop.current!,
        sprint: sprint.current!,
        interactAt: (x, y) => props!.interactAt(current!, x, y),
      });
      navigation.current = movement;
      await current.enter({
        url: ticket.relayUrl,
        room: ticket.roomId,
        credential: async () => {
          // Fetch after asset preparation so the one-use ticket cannot expire while models load.
          const next = await requestWorldTicket(teamID, controller.signal);
          if (
            next.roomId !== ticket.roomId ||
            next.relayUrl !== ticket.relayUrl
          )
            throw Error("World endpoint changed");
          return next.ticket;
        },
      });
    })().catch((error: unknown) => {
      if (!cancelled) {
        setFailed(
          error instanceof Error && error.message === copy.locked
            ? copy.locked
            : copy.unavailable,
        );
        setStatus("failed");
        dispose();
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      dispose();
      if (world.current === current) world.current = null;
      if (navigation.current === movement) navigation.current = null;
    };
  }, [teamID, attempt]);
  const ready = status === "ready" && !failed;
  const run = (action: (w: Zoomap) => void) => {
    if (ready && world.current) action(world.current);
  };
  return (
    <div
      ref={bindViewport}
      className={`team-world${fullscreen ? " team-world--fullscreen" : ""}`}
      aria-label={copy.title}
      role="region"
    >
      {developmentBuild && (
        <DevControls
          settings={debugSettings}
          onChange={updateDebug}
          read={readDebug}
        />
      )}
      <div className="team-world-bar">
        <div>
          <span className="team-world-eyebrow">{copy.title}</span>
          <strong role="status">{failed ?? copy.states[status]}</strong>
        </div>
        <span className="team-world-presence">{copy.people(people)}</span>
        <button
          aria-label={fullscreen ? copy.exitFullscreen : copy.fullscreen}
          aria-pressed={fullscreen}
          onClick={() =>
            void (fullscreen ? exitFullscreen() : enterFullscreen())
          }
        >
          {fullscreen ? copy.exitFullscreen : copy.fullscreen}
        </button>
      </div>
      <div className="team-world-field">
        {!ready && (
          <div
            className="team-world-connection"
            role="status"
            aria-live="polite"
          >
            <div>
              <span aria-hidden="true">◌</span>
              <h2>{failed ? copy.states.failed : copy.states[status]}</h2>
              <p>
                {failed ??
                  (status === "connecting"
                    ? copy.loading
                    : ["paused", "reconnecting"].includes(status)
                      ? copy.connectionPaused
                      : copy.connectionStopped)}
              </p>
              {status !== "connecting" && (
                <button
                  onClick={() => {
                    setFailed(null);
                    setStatus("connecting");
                    setPeople(0);
                    setMode("joystick");
                    setZoom(2);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {copy.reconnect}
                </button>
              )}
              <Link href="/team">{copy.back}</Link>
            </div>
          </div>
        )}
        <div
          ref={container}
          inert={!ready}
          className="team-world-canvas"
          aria-label={copy.title}
        />
        <div
          className="team-world-score"
          hidden={!ready}
          role="status"
          aria-live="polite"
          aria-label={copy.soccer.scoreboard}
        >
          <small>
            {score.pitch === "main-pitch"
              ? copy.soccer.main
              : copy.soccer.garden}
          </small>
          <span>
            {copy.soccer.burgundy} <b>{score.burgundy}</b> <i>—</i>{" "}
            {copy.soccer.gold} <b>{score.gold}</b>
          </span>
        </div>
        <button
          className="team-world-kick"
          disabled={!ready}
          onClick={() => run((w) => w.action("kick"))}
        >
          {copy.kick}
        </button>
        <div ref={stick} className="team-world-stick" aria-hidden="true" hidden>
          <span />
        </div>
        <div className="team-world-quick-action" hidden={!selectedTool}>
          <button
            disabled={!ready || !toolReady}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              run((w) => w.useTool(true));
            }}
            onPointerUp={() => run((w) => w.useTool(false))}
            onPointerCancel={() => world.current?.cancelTool()}
            onLostPointerCapture={() => world.current?.cancelTool()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                run((w) => w.useTool(true));
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                run((w) => w.useTool(false));
              }
            }}
            onBlur={() => world.current?.cancelTool()}
          >
            {copy.use}
          </button>
        </div>
        <div
          className="team-world-item-actions"
          aria-label="Nearby items"
          role="group"
        >
          {itemActions.map((action) => (
            <button
              key={`${action.object}:${action.action}`}
              disabled={!ready || action.disabled}
              onClick={() =>
                run((w) => w.interact(action.object, action.action))
              }
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="team-world-dock" inert={!ready}>
          <details className="team-world-panel" name="team-world-controls">
            <summary>{copy.controls}</summary>
            <div
              className="team-world-controls"
              role="group"
              aria-label="Movement"
            >
              <select
                aria-label={copy.movement}
                disabled={!ready}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as MovementMode;
                  setMode(next);
                  navigation.current?.setMode(next);
                }}
              >
                <option value="path">{copy.path}</option>
                <option value="joystick">{copy.joystick}</option>
              </select>
              <label className="team-world-view-distance">
                {copy.viewDistance}
                <input
                  type="range"
                  aria-label={copy.viewDistance}
                  min="1"
                  max="3"
                  step="0.25"
                  value={zoom}
                  disabled={!ready}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setZoom(next);
                    run((w) => setCameraZoom(w, next));
                  }}
                />
              </label>
              <button ref={sprint} disabled={!ready}>
                {copy.sprint}
              </button>
              <button ref={stop} hidden>
                {copy.stop}
              </button>
              <p>{copy.navigation[mode]}</p>
              <p>{copy.hint}</p>
            </div>
          </details>
          <details className="team-world-panel" name="team-world-controls">
            <summary>{copy.equipment}</summary>
            <div
              className="team-world-controls"
              role="group"
              aria-label="Equipment"
            >
              <select
                aria-label={copy.equipment}
                disabled={!ready}
                value={selectedTool}
                onChange={(e) =>
                  run((w) =>
                    w.equipTool((e.target.value || null) as ToolId | null),
                  )
                }
              >
                <option value="">{copy.empty}</option>
                {copy.tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </select>
              <button
                disabled={!ready}
                onClick={() =>
                  run((w) =>
                    w.setToolDrawn(
                      !(
                        w.state.actions?.players[w.session]?.performance
                          ?.drawn ?? true
                      ),
                    ),
                  )
                }
              >
                {drawn ? copy.stow : copy.draw}
              </button>
            </div>
          </details>
          <details className="team-world-panel" name="team-world-controls">
            <summary>{copy.expression}</summary>
            <div
              className="team-world-controls"
              role="group"
              aria-label="Expressions"
            >
              <select
                aria-label={copy.expression}
                disabled={!ready}
                value=""
                onChange={(e) => run((w) => w.emote(e.target.value))}
              >
                <option value="" disabled>
                  {copy.expression}
                </option>
                {copy.emotes.map((emote) => (
                  <option key={emote.id} value={emote.id}>
                    {emote.label}
                  </option>
                ))}
              </select>
              <button
                disabled={!ready}
                onClick={() => run((w) => w.emote(null))}
              >
                {copy.cancel}
              </button>
            </div>
          </details>
        </div>
        <span ref={hint} className="team-world-hint" role="status" />
      </div>
    </div>
  );
}
