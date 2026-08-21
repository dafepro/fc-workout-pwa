"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { teamCanvasCopy } from "../content";
import type { CompletionKind } from "../model";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";

export function TeamCanvasToday() {
  const router = useRouter();
  const { state, complete, recordRest } = useTeamCanvas();
  const [expanded, setExpanded] = useState(false);
  const [completion, setCompletion] = useState<CompletionKind>("goal");
  const [effort, setEffort] = useState(4);
  const [tiredness, setTiredness] = useState(3);
  const copy = teamCanvasCopy.today;

  useEffect(() => {
    if (state.primaryComplete) router.replace(teamCanvasRoutes.team);
  }, [router, state.primaryComplete]);

  if (state.primaryComplete) {
    return <p className="tc-opening">Opening your team canvas…</p>;
  }

  if (state.dayKind === "rest") {
    return (
      <div className="tc-today">
        <article className="tc-daily-card tc-daily-card--rest">
          <p className="tc-eyebrow">{copy.restEyebrow}</p>
          <h1>{copy.restTitle}</h1>
          <p className="tc-description">{copy.restDescription}</p>
          <button
            className="tc-plus"
            type="button"
            aria-label={copy.restAction}
            onClick={() => {
              recordRest();
              router.push(teamCanvasRoutes.team);
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
        </article>
      </div>
    );
  }

  return (
    <div className="tc-today">
      <article className={`tc-daily-card${expanded ? " is-expanded" : ""}`}>
        <p className="tc-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.trainingTitle}</h1>
        <p className="tc-context">{copy.trainingContext}</p>
        <p className="tc-description">{copy.trainingDescription}</p>

        {expanded ? (
          <div className="tc-checkin">
            <h2>{copy.formTitle}</h2>
            <div
              className="tc-targets"
              role="group"
              aria-label={copy.formTitle}
            >
              <button
                type="button"
                aria-pressed={completion === "goal"}
                onClick={() => setCompletion("goal")}
              >
                {copy.goal}
              </button>
              <button
                type="button"
                aria-pressed={completion === "reach"}
                onClick={() => setCompletion("reach")}
              >
                {copy.reach}
              </button>
            </div>
            <button
              className="tc-alternative"
              type="button"
              aria-pressed={completion === "approved-alternative"}
              onClick={() => setCompletion("approved-alternative")}
            >
              {copy.alternative}
            </button>
            <div className="tc-signals">
              <label>
                <span>{copy.effort}</span>
                <select
                  value={effort}
                  onChange={(event) => setEffort(Number(event.target.value))}
                >
                  {scaleOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.tiredness}</span>
                <select
                  value={tiredness}
                  onChange={(event) => setTiredness(Number(event.target.value))}
                >
                  {scaleOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="tc-save"
              type="button"
              onClick={() => {
                complete({ completion, effort, tiredness });
                router.push(teamCanvasRoutes.team);
              }}
            >
              {copy.save}
            </button>
          </div>
        ) : (
          <button
            className="tc-plus"
            type="button"
            aria-label={copy.addLabel}
            onClick={() => setExpanded(true)}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </article>
    </div>
  );
}

const scaleOptions = [1, 2, 3, 4, 5, 6, 7] as const;
