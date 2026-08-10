"use client";

import { useState } from "react";
import { copy } from "../content/copy";
import type { Player } from "../domain/types";
import { AvatarArt } from "./AvatarArt";
import { AVATAR_LAYERS } from "./catalog";
import { playerColor } from "./color";
import { normalizeAvatar } from "./config";
import type {
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
} from "./types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvatarBuilder({
  player,
  config,
  onSave,
}: {
  player: Player;
  config: AvatarConfiguration;
  onSave(config: AvatarConfiguration): Promise<void>;
}) {
  const saved = normalizeAvatar(config);
  const [draft, setDraft] = useState<AvatarConfiguration>(saved);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const fallbackBackground = playerColor(player.id);

  function choose(kind: string, optionID: string) {
    setDraft((current) => ({ ...current, [kind]: optionID }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    try {
      await onSave(draft);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section
      className="card avatar-builder"
      aria-labelledby="avatar-builder-title"
    >
      <div className="avatar-builder__intro">
        <p className="eyebrow">{copy.avatar.eyebrow}</p>
        <h2 id="avatar-builder-title">{copy.avatar.title}</h2>
        <p>{copy.avatar.intro}</p>
      </div>
      <div className="avatar-builder__preview">
        <span className="avatar avatar--large" aria-label={copy.avatar.preview}>
          <AvatarArt config={draft} fallbackBackground={fallbackBackground} />
        </span>
      </div>
      {AVATAR_LAYERS.map((layer) => (
        <fieldset key={layer.kind} className="avatar-builder__layer">
          <legend>{layer.legend}</legend>
          <div className={controlClass(layer)}>
            {layer.options.map((option) => (
              <Choice
                key={option.id}
                layer={layer}
                option={option}
                draft={draft}
                fallbackBackground={fallbackBackground}
                onChoose={() => choose(layer.kind, option.id)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="avatar-builder__actions">
        <button
          type="button"
          className="button button--lime"
          disabled={status === "saving"}
          onClick={() => void save()}
        >
          {status === "saving" ? copy.avatar.saving : copy.avatar.save}
        </button>
        <button
          type="button"
          className="button button--outline"
          onClick={() => {
            setDraft(saved);
            setStatus("idle");
          }}
        >
          {copy.avatar.cancel}
        </button>
      </div>
      {status === "saved" ? (
        <p className="avatar-builder__status" role="status">
          {copy.avatar.saved}
        </p>
      ) : null}
      {status === "error" ? (
        <div className="notice notice--error" role="alert">
          <strong>{copy.avatar.failed}</strong>
        </div>
      ) : null}
    </section>
  );
}

function Choice({
  layer,
  option,
  draft,
  fallbackBackground,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  option: AvatarOption;
  draft: AvatarConfiguration;
  fallbackBackground: string;
  onChoose(): void;
}) {
  const selected = draft[layer.kind] === option.id;
  return (
    <div className={`avatar-choice ${selected ? "is-selected" : ""}`}>
      <label title={option.label}>
        <input
          type="radio"
          name={`avatar-${layer.kind}`}
          value={option.id}
          checked={selected}
          onChange={onChoose}
        />
        {layer.control === "swatch" ? (
          <span
            className="avatar-choice__swatch"
            style={{ background: option.color ?? fallbackBackground }}
            aria-hidden="true"
          />
        ) : (
          <span className="avatar-choice__icon" aria-hidden="true">
            <span className="avatar avatar--small">
              {/* The card previews the option against the rest of the draft, so a
                  choice is judged in the look it will actually appear in. */}
              <AvatarArt
                config={{ ...draft, [layer.kind]: option.id }}
                fallbackBackground={fallbackBackground}
              />
            </span>
          </span>
        )}
        <span
          className={
            layer.control === "swatch" ? "sr-only" : "avatar-choice__label"
          }
        >
          {option.label}
        </span>
      </label>
    </div>
  );
}

function controlClass(layer: AvatarLayerDefinition): string {
  return layer.control === "swatch"
    ? "avatar-builder__swatches"
    : "avatar-builder__cards";
}
