"use client";

import { useState } from "react";
import { copy } from "../content/copy";
import { AvatarArt, AvatarPartArt } from "./AvatarArt";
import { AVATAR_CATEGORIES, AVATAR_LAYERS } from "./catalog";
import {
  defaultAvatar,
  isAvatarConfiguration,
  layerPalette,
  normalizeAvatar,
} from "./config";
import type {
  AvatarCategoryKind,
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
  AvatarPaletteKey,
} from "./types";

type SaveStatus = "idle" | "saving" | "error";

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

  return (
    <AvatarBuilderEditor
      key={configurationKey(startingConfig)}
      startingConfig={startingConfig}
      onSave={onSave}
    />
  );
}

function AvatarBuilderEditor({
  startingConfig,
  onSave,
}: {
  startingConfig: AvatarConfiguration;
  onSave(config: AvatarConfiguration): Promise<void>;
}) {
  const [draft, setDraft] = useState<AvatarConfiguration>(startingConfig);
  const [activeCategory, setActiveCategory] =
    useState<AvatarCategoryKind>("head");
  const [openPalette, setOpenPalette] = useState<
    AvatarPaletteKey | "backgroundColor" | null
  >(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const category = AVATAR_CATEGORIES.find(({ id }) => id === activeCategory)!;
  const dirty = configurationKey(draft) !== configurationKey(startingConfig);

  function update(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    try {
      await onSave(normalizeAvatar(draft));
      setStatus("idle");
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
            onClick={() => {
              setActiveCategory(id);
              setOpenPalette(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="avatar-builder__layer">
        {activeCategory === "background" ? (
          <BackgroundControls
            draft={draft}
            openPalette={openPalette}
            onTogglePalette={() =>
              setOpenPalette((current) =>
                current === "backgroundColor" ? null : "backgroundColor",
              )
            }
            onChange={update}
          />
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
                paletteOpen={openPalette === layer.paletteKey}
                onTogglePalette={() =>
                  setOpenPalette((current) =>
                    current === layer.paletteKey
                      ? null
                      : (layer.paletteKey ?? null),
                  )
                }
                onChange={update}
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
      </div>

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
  paletteOpen,
  onTogglePalette,
  onChange,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  draft: AvatarConfiguration;
  showLegend: boolean;
  paletteOpen: boolean;
  onTogglePalette(): void;
  onChange(key: string, value: string): void;
  onChoose(optionID: string): void;
}) {
  return (
    <fieldset className="avatar-builder__sublayer">
      <legend className={showLegend ? "" : "sr-only"}>{layer.legend}</legend>
      {layer.paletteKey ? (
        <LayerPaletteControl
          paletteKey={layer.paletteKey}
          draft={draft}
          open={paletteOpen}
          onToggle={onTogglePalette}
          onChange={onChange}
        />
      ) : null}
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

function LayerPaletteControl({
  paletteKey,
  draft,
  open,
  onToggle,
  onChange,
}: {
  paletteKey: AvatarPaletteKey;
  draft: AvatarConfiguration;
  open: boolean;
  onToggle(): void;
  onChange(key: string, value: string): void;
}) {
  const palette = layerPalette(draft, paletteKey);
  const layerName = paletteName(paletteKey);

  function change(part: keyof typeof palette, value: string) {
    const next = { ...palette, [part]: value };
    onChange(paletteKey, `${next.color}:${next.accent}`);
  }

  return (
    <div className="avatar-palette">
      <button
        type="button"
        className="avatar-palette__button"
        aria-label={`${layerName} colors`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span style={{ backgroundColor: palette.color }} />
        <span style={{ backgroundColor: palette.accent }} />
      </button>
      {open ? (
        <fieldset className="avatar-palette__popover">
          <legend className="sr-only">{`${layerName} colors`}</legend>
          <label>
            <span className="sr-only">{`${layerName} color`}</span>
            <input
              type="color"
              value={palette.color}
              aria-label={`${layerName} color`}
              onChange={(event) => change("color", event.currentTarget.value)}
            />
          </label>
          <label>
            <span className="sr-only">{`${layerName} accent`}</span>
            <input
              type="color"
              value={palette.accent}
              aria-label={`${layerName} accent`}
              onChange={(event) => change("accent", event.currentTarget.value)}
            />
          </label>
        </fieldset>
      ) : null}
    </div>
  );
}

function BackgroundControls({
  draft,
  openPalette,
  onTogglePalette,
  onChange,
}: {
  draft: AvatarConfiguration;
  openPalette: AvatarPaletteKey | "backgroundColor" | null;
  onTogglePalette(): void;
  onChange(key: string, value: string): void;
}) {
  const effect = AVATAR_LAYERS.find(({ kind }) => kind === "effect")!;
  return (
    <>
      <fieldset className="avatar-builder__sublayer">
        <legend>{copy.avatar.legends.background}</legend>
        <div className="avatar-palette">
          <button
            type="button"
            className="avatar-palette__button avatar-palette__button--single"
            aria-label="Background color"
            aria-expanded={openPalette === "backgroundColor"}
            onClick={onTogglePalette}
          >
            <span style={{ backgroundColor: draft.backgroundColor }} />
          </button>
          {openPalette === "backgroundColor" ? (
            <fieldset className="avatar-palette__popover avatar-palette__popover--single">
              <legend className="sr-only">Background color</legend>
              <label>
                <span className="sr-only">Background color</span>
                <input
                  type="color"
                  value={draft.backgroundColor}
                  aria-label="Background color"
                  onChange={(event) =>
                    onChange("backgroundColor", event.currentTarget.value)
                  }
                />
              </label>
            </fieldset>
          ) : null}
        </div>
      </fieldset>
      <LayerPicker
        layer={effect}
        draft={draft}
        showLegend
        paletteOpen={false}
        onTogglePalette={() => undefined}
        onChange={onChange}
        onChoose={(optionID) => onChange("effect", optionID)}
      />
    </>
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
            &#128274;
          </span>
        ) : null}
      </label>
    </div>
  );
}

function paletteName(key: AvatarPaletteKey): string {
  const names = copy.avatar.palette;
  return {
    headPalette: names.head,
    kitPalette: names.kit,
    hatPalette: names.hat,
    eyewearPalette: names.eyewear,
  }[key];
}

function configurationKey(config: AvatarConfiguration): string {
  return JSON.stringify(normalizeAvatar(config));
}
