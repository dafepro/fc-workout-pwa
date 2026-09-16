"use client";
import { useEffect, useRef, useState } from "react";
import {
  Zoomap,
  cannonBehavior,
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
const map = mapJSON as WorldMap;
export default function TeamWorld({ teamID }: { teamID: string }) {
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
  const [toolReady, setToolReady] = useState(false);
  const [selectedTool, setSelectedTool] = useState("");
  const [drawn, setDrawn] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let controlsTimer: ReturnType<typeof setInterval> | undefined;
    let kit: Awaited<ReturnType<typeof loadActionKit>> | undefined;
    let cannon: Awaited<ReturnType<typeof loadCannonKit>> | undefined;
    let current: Zoomap | undefined;
    let movement: ReturnType<typeof createNavigationControls> | undefined;
    const controller = new AbortController();
    const dispose = () => {
      clearInterval(controlsTimer);
      movement?.dispose();
      current?.dispose();
      cannon?.dispose();
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
      current = new Zoomap({
        container: container.current!,
        map,
        catalog: [],
        objectBehaviors: [cannonBehavior],
        visuals: {
          character: kit.character,
          scenery: (scene, m) => {
            kit!.scenery(scene, m);
            cannon!.scenery(scene);
          },
          frame: cannon.frame,
        },
        onStatus: (s) => {
          if (!cancelled) setStatus(s);
        },
        onChange: () => {
          if (!cancelled) setPeople(current?.roster.length ?? 0);
        },
      });
      world.current = current;
      controlsTimer = setInterval(() => {
        const action = current?.state.actions?.players[current.session];
        setSelectedTool(action?.tool ?? "");
        setDrawn(action?.performance?.drawn ?? true);
        setToolReady(
          !!action?.tool &&
            kit?.diagnostics().pending === 0 &&
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
    <div className="team-world">
      <div className="team-world-bar">
        <strong role="status">{failed ?? copy.states[status]}</strong>
        <span>{copy.people(people)}</span>
      </div>
      {(failed || ["failed", "denied", "full"].includes(status)) && (
        <button
          onClick={() => {
            setFailed(null);
            setStatus("connecting");
            setPeople(0);
            setMode("path");
            setAttempt((n) => n + 1);
          }}
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
      </div>
      <div className="team-world-controls" role="group" aria-label="Movement">
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
        <button ref={sprint} disabled={!ready}>
          {copy.sprint}
        </button>
        <button ref={stop} hidden>
          {copy.stop}
        </button>
        <button disabled={!ready} onClick={() => run((w) => w.action("kick"))}>
          {copy.kick}
        </button>
      </div>
      <span ref={hint} className="team-world-hint" role="status" />
      <div className="team-world-controls" role="group" aria-label="Equipment">
        <select
          aria-label={copy.equipment}
          disabled={!ready}
          value={selectedTool}
          onChange={(e) =>
            run((w) => w.equipTool((e.target.value || null) as ToolId | null))
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
        <button
          disabled={!ready}
          onClick={() =>
            run((w) =>
              w.setToolDrawn(
                !(
                  w.state.actions?.players[w.session]?.performance?.drawn ??
                  true
                ),
              ),
            )
          }
        >
          {drawn ? copy.stow : copy.draw}
        </button>
      </div>
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
        <button disabled={!ready} onClick={() => run((w) => w.emote(null))}>
          {copy.cancel}
        </button>
      </div>
      <p>{copy.hint}</p>
    </div>
  );
}
