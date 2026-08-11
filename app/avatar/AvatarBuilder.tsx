"use client";

import { useState } from "react";
import { copy } from "../content/copy";
import { AvatarArt, AvatarPartArt } from "./AvatarArt";
import { AVATAR_CATEGORIES, AVATAR_LAYERS } from "./catalog";
import {
  defaultAvatar,
  isAvatarConfiguration,
  normalizeAvatar,
} from "./config";
import type {
  AvatarCategoryKind,
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
} from "./types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvatarBuilder({
  config,
  onSave,
}: {
  config: AvatarConfiguration;
  onSave(config: AvatarConfiguration): Promise<void>;
}) {
  const startingConfig = isAvatarConfiguration(config)
    ? normalizeAvatar(config)
    : defaultAvatar();
  const [saved, setSaved] = useState<AvatarConfiguration>(startingConfig);
  const [draft, setDraft] = useState<AvatarConfiguration>(startingConfig);
  const [activeCategory, setActiveCategory] =
    useState<AvatarCategoryKind>("head");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const category = AVATAR_CATEGORIES.find(({ id }) => id === activeCategory)!;
  const dirty = configurationKey(draft) !== configurationKey(saved);

  function update(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function save() {
    const next = normalizeAvatar(draft);
    setStatus("saving");
    try {
      await onSave(next);
      setSaved(next);
      setDraft(next);
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
        <h1 id="avatar-builder-title">{copy.avatar.title}</h1>
      </div>

      <div
        className="avatar-builder__preview"
        role="img"
        aria-label={copy.avatar.preview}
      >
        <span className="avatar-builder__portrait" aria-hidden="true">
          <AvatarArt config={draft} framing="studio" />
        </span>
      </div>

      <nav
        className="avatar-builder__categories"
        aria-label="Avatar categories"
      >
        {AVATAR_CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={activeCategory === id ? "is-active" : ""}
            aria-pressed={activeCategory === id}
            onClick={() => setActiveCategory(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="avatar-builder__layer">
        {activeCategory === "colors" ? (
          <ColorControls draft={draft} onChange={update} />
        ) : (
          category.layerKinds.map((kind) => {
            const layer = AVATAR_LAYERS.find(
              (candidate) => candidate.kind === kind,
            )!;
            return (
              <LayerPicker
                key={kind}
                layer={layer}
                draft={draft}
                showLegend={activeCategory === "gear"}
                onChoose={(optionID) => update(kind, optionID)}
              />
            );
          })
        )}
      </div>

      <div className="avatar-builder__actions">
        <button
          type="button"
          className="button button--lime"
          disabled={status === "saving" || !dirty}
          onClick={() => void save()}
        >
          {status === "saving" ? copy.avatar.saving : copy.avatar.save}
        </button>
        <button
          type="button"
          className="button button--outline"
          disabled={!dirty}
          onClick={() => {
            setDraft(saved);
            setStatus("idle");
          }}
        >
          {copy.avatar.reset}
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

function LayerPicker({
  layer,
  draft,
  showLegend,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  draft: AvatarConfiguration;
  showLegend: boolean;
  onChoose(optionID: string): void;
}) {
  return (
    <fieldset className="avatar-builder__sublayer">
      <legend className={showLegend ? "" : "sr-only"}>{layer.legend}</legend>
      <div className="avatar-builder__tray">
        {layer.options.map((option) => (
          <Choice
            key={option.id}
            layer={layer}
            option={option}
            draft={draft}
            onChoose={() => onChoose(option.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Choice({
  layer,
  option,
  draft,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  option: AvatarOption;
  draft: AvatarConfiguration;
  onChoose(): void;
}) {
  const selected = draft[layer.kind] === option.id;
  const locked = option.unlock === "advancement";
  const accessibleName = locked
    ? `${option.label}, ${copy.avatar.locked}`
    : option.label;

  return (
    <div
      className={`avatar-choice${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
    >
      <label title={accessibleName}>
        <input
          type="radio"
          name={`avatar-${layer.kind}`}
          value={option.id}
          checked={selected}
          disabled={locked}
          aria-label={accessibleName}
          onChange={onChoose}
        />
        <span className="avatar-choice__icon" aria-hidden="true">
          <AvatarPartArt kind={layer.kind} option={option} config={draft} />
        </span>
        {locked ? (
          <span className="avatar-choice__lock" aria-hidden="true">
            🔒
          </span>
        ) : null}
      </label>
    </div>
  );
}

function ColorControls({
  draft,
  onChange,
}: {
  draft: AvatarConfiguration;
  onChange(key: string, color: string): void;
}) {
  const colors = [
    {
      key: "avatarColor",
      label: copy.avatar.colors.avatar,
      shortLabel: "Avatar",
    },
    {
      key: "accentColor",
      label: copy.avatar.colors.accent,
      shortLabel: "Accent",
    },
    {
      key: "backgroundColor",
      label: copy.avatar.colors.background,
      shortLabel: "Solid",
    },
  ] as const;

  return (
    <fieldset className="avatar-builder__colors">
      <legend className="sr-only">{copy.avatar.categories.colors}</legend>
      {colors.map(({ key, label, shortLabel }) => (
        <label key={key}>
          <span aria-hidden="true">{shortLabel}</span>
          <span className="sr-only">{label}</span>
          <input
            type="color"
            value={draft[key]}
            aria-label={label}
            onChange={(event) => onChange(key, event.currentTarget.value)}
          />
        </label>
      ))}
    </fieldset>
  );
}

function configurationKey(config: AvatarConfiguration): string {
  return JSON.stringify(normalizeAvatar(config));
}
