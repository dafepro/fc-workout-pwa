"use client";

import { useState } from "react";
import type { TeamCanvasSettings } from "../../data/team-canvas-gateway";
import {
  TEAM_CANVAS_BACKGROUNDS,
  TEAM_CANVAS_STAMPS,
  TEAM_CANVAS_TEXT_STYLES,
} from "../catalog";
import { teamCanvasCopy } from "../content";
import { stampAssetLabel } from "./StampAsset";
import type {
  TeamCanvasConnectionState,
  TeamCanvasTelemetry,
} from "../../player/team-canvas/widget-contract";

export function CanvasDevToolbox({
  settings,
  onSave,
  connection = "local",
  telemetry = {
    reconnects: 0,
    inputToRenderMs: null,
    correctionDistance: 0,
    hostEpoch: 0,
    droppedFrames: 0,
    checkpointAgeMs: null,
  },
}: {
  settings: TeamCanvasSettings;
  onSave(settings: TeamCanvasSettings): Promise<void>;
  connection?: TeamCanvasConnectionState;
  telemetry?: TeamCanvasTelemetry;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const copy = teamCanvasCopy.board.toolbox;

  return (
    <details className="tc-toolbox">
      <summary>
        <strong>{copy.title}</strong>
        <span>{copy.summary}</span>
      </summary>
      <div className="tc-toolbox__body">
        <dl className="tc-toolbox__telemetry" aria-label="Live Canvas health">
          <div>
            <dt>Connection</dt>
            <dd>{connection}</dd>
          </div>
          <div>
            <dt>Reconnects</dt>
            <dd>{telemetry.reconnects}</dd>
          </div>
          <div>
            <dt>Input to render</dt>
            <dd>{formatMilliseconds(telemetry.inputToRenderMs)}</dd>
          </div>
          <div>
            <dt>Correction</dt>
            <dd>{telemetry.correctionDistance.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Host epoch</dt>
            <dd>{telemetry.hostEpoch}</dd>
          </div>
          <div>
            <dt>Dropped frames</dt>
            <dd>{telemetry.droppedFrames}</dd>
          </div>
          <div>
            <dt>Checkpoint age</dt>
            <dd>{formatMilliseconds(telemetry.checkpointAgeMs)}</dd>
          </div>
        </dl>
        <label>
          <span>{copy.background}</span>
          <select
            value={draft.backgroundAssetId}
            onChange={(event) =>
              setDraft({ ...draft, backgroundAssetId: event.target.value })
            }
          >
            {TEAM_CANVAS_BACKGROUNDS.map((background) => (
              <option key={background.id} value={background.id}>
                {background.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.backgroundColor}</span>
          <input
            type="color"
            value={draft.backgroundColor}
            onChange={(event) =>
              setDraft({ ...draft, backgroundColor: event.target.value })
            }
          />
        </label>
        <label>
          <span>{copy.textColor}</span>
          <input
            type="color"
            value={draft.textColor}
            onChange={(event) =>
              setDraft({ ...draft, textColor: event.target.value })
            }
          />
        </label>
        <label>
          <span>{copy.textSize}</span>
          <input
            type="range"
            min="64"
            max="160"
            step="4"
            value={draft.textSize}
            onChange={(event) =>
              setDraft({ ...draft, textSize: Number(event.target.value) })
            }
          />
          <output>{draft.textSize}px</output>
        </label>
        <label>
          <span>{copy.textStyle}</span>
          <select
            value={draft.textStyle}
            onChange={(event) =>
              setDraft({ ...draft, textStyle: event.target.value })
            }
          >
            {TEAM_CANVAS_TEXT_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.extraStamps}</span>
          <input
            type="number"
            min="0"
            max="16"
            step="1"
            value={draft.developerStampLimit}
            onChange={(event) =>
              setDraft({
                ...draft,
                developerStampLimit: Math.max(
                  0,
                  Math.min(16, Number(event.target.value) || 0),
                ),
              })
            }
          />
        </label>
        <fieldset>
          <legend>{copy.stamps}</legend>
          {draft.stampChoices.map((choice, index) => (
            <select
              key={`${index}-${choice}`}
              aria-label={`Stamp choice ${index + 1}`}
              value={choice}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  stampChoices: swapStampChoice(
                    draft.stampChoices,
                    index,
                    event.target.value,
                  ),
                })
              }
            >
              {TEAM_CANVAS_STAMPS.map((stamp) => (
                <option key={stamp.id} value={stamp.id}>
                  {stampAssetLabel(stamp)}
                </option>
              ))}
            </select>
          ))}
        </fieldset>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave(draft).finally(() => setSaving(false));
          }}
        >
          {copy.apply}
        </button>
      </div>
    </details>
  );
}

function formatMilliseconds(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function swapStampChoice(
  choices: string[],
  index: number,
  next: string,
): string[] {
  const result = [...choices];
  const duplicate = result.indexOf(next);
  if (duplicate >= 0) result[duplicate] = result[index];
  result[index] = next;
  return result;
}
