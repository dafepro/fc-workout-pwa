"use client";
import {
  loadInteractiveProps,
  type ItemAction,
} from "./adapters/interactive-props";
import { useEffect, useRef, useState } from "react";
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
import {
  createNavigationControls,
  type MovementMode,
} from "./adapters/navigation";
import { requestWorldTicket } from "./gateway";
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
    [mode, setMode] = useState<MovementMode>("path");
  const [itemActions, setItemActions] = useState<ItemAction[]>([]);
  const [toolReady, setToolReady] = useState(false);
  const [selectedTool, setSelectedTool] = useState("");
  const [drawn, setDrawn] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let viewportObserver: ResizeObserver | undefined;
    let controlsTimer: ReturnType<typeof setInterval> | undefined;
    let kit: Awaited<ReturnType<typeof loadActionKit>> | undefined;
    let cannon: Awaited<ReturnType<typeof loadCannonKit>> | undefined;
    let props: Awaited<ReturnType<typeof loadInteractiveProps>> | undefined;
    let current: Zoomap | undefined;
    let movement: ReturnType<typeof createNavigationControls> | undefined;
    const controller = new AbortController();
    const dispose = () => {
      clearInterval(controlsTimer);
      viewportObserver?.disconnect();
      movement?.dispose();
      current?.dispose();
      cannon?.dispose();
      props?.dispose();
      kit?.dispose();
    };
    void (async () => {
      const ticket = await requestWorldTicket(teamID, controller.signal);
      if (cancelled) return;
      kit = await loadActionKit(() => {
        if (!cancelled) {
          setFailed(copy.unavailable);
          current?.setInputEnabled(false);
        }
      });
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
      current = new Zoomap({
        container: container.current!,
        map,
        catalog: [],
        objectBehaviors: [cannonBehavior, switchBehavior],
        visuals: {
          character: kit.character,
          scenery: (scene, m) => {
            kit!.scenery(scene, m);
            cannon!.scenery(scene);
            props!.scenery(scene);
          },
          frame: (context) => {
            cannon!.frame(context);
            props!.frame(context);
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
      const resizeBudget = () => {
        if (cancelled || !current || !container.current) return;
        const ratio = renderPixelRatio(
          container.current.clientWidth,
          container.current.clientHeight,
          devicePixelRatio,
        );
        if (Math.abs(current.view.renderer.getPixelRatio() - ratio) > 0.001)
          current.view.renderer.setPixelRatio(ratio);
      };
      viewportObserver = new ResizeObserver(resizeBudget);
      viewportObserver.observe(container.current!);
      resizeBudget();
      let previousActions = "";
      controlsTimer = setInterval(() => {
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
      {(failed || ["failed", "denied", "full"].includes(status)) && (
        <button
          onClick={() => {
            setFailed(null);
            setStatus("connecting");
            setPeople(0);
            setMode("path");
            setZoom(2);
            setAttempt((n) => n + 1);
          }}
          className="team-world-retry"
        >
          {copy.retry}
        </button>
      )}
      <div className="team-world-field">
        <div
          ref={container}
          className="team-world-canvas"
          aria-label={copy.title}
        />
        <div ref={stick} className="team-world-stick" hidden>
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
        <div className="team-world-dock">
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
              <button
                disabled={!ready}
                onClick={() => run((w) => w.action("kick"))}
              >
                {copy.kick}
              </button>
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
