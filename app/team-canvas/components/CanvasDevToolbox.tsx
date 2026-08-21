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

export function CanvasDevToolbox({
  settings,
  onSave,
}: {
  settings: TeamCanvasSettings;
  onSave(settings: TeamCanvasSettings): Promise<void>;
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
