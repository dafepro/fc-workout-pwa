"use client";

import { useEffect, useRef, useState } from "react";
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
  unlockedOptionIDs = EMPTY_UNLOCKS,
  onSave,
}: {
  config: AvatarConfiguration;
  unlockedOptionIDs?: ReadonlySet<string>;
  onSave(config: AvatarConfiguration): Promise<void>;
}) {
  const startingConfig = isAvatarConfiguration(config)
    ? normalizeAvatar(config)
    : defaultAvatar();

  return (
    <AvatarBuilderEditor
      key={configurationKey(startingConfig)}
      startingConfig={startingConfig}
      unlockedOptionIDs={unlockedOptionIDs}
      onSave={onSave}
    />
  );
}

function AvatarBuilderEditor({
  startingConfig,
  unlockedOptionIDs,
  onSave,
}: {
  startingConfig: AvatarConfiguration;
  unlockedOptionIDs: ReadonlySet<string>;
  onSave(config: AvatarConfiguration): Promise<void>;
}) {
  const [draft, setDraft] = useState<AvatarConfiguration>(startingConfig);
  const [activeCategory, setActiveCategory] =
    useState<AvatarCategoryKind>("head");
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
            onClick={() => setActiveCategory(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="avatar-builder__layer">
        {activeCategory === "background" ? (
          <BackgroundControls draft={draft} onChange={update} />
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
                unlockedOptionIDs={unlockedOptionIDs}
                showLegend={activeCategory === "gear"}
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
  unlockedOptionIDs,
  showLegend,
  onChange,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  draft: AvatarConfiguration;
  unlockedOptionIDs: ReadonlySet<string>;
  showLegend: boolean;
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
            unlocked={unlockedOptionIDs.has(option.id)}
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
  onChange,
}: {
  paletteKey: AvatarPaletteKey;
  draft: AvatarConfiguration;
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
      <ColorSwatchPicker
        name={`${layerName} color`}
        value={palette.color}
        onChange={(value) => change("color", value)}
      />
      <ColorSwatchPicker
        name={`${layerName} accent`}
        value={palette.accent}
        onChange={(value) => change("accent", value)}
      />
    </div>
  );
}

function BackgroundControls({
  draft,
  onChange,
}: {
  draft: AvatarConfiguration;
  onChange(key: string, value: string): void;
}) {
  const effect = AVATAR_LAYERS.find(({ kind }) => kind === "effect")!;
  return (
    <>
      <fieldset className="avatar-builder__sublayer">
        <legend>{copy.avatar.legends.background}</legend>
        <div className="avatar-palette">
          <ColorSwatchPicker
            name="Background color"
            value={draft.backgroundColor}
            onChange={(value) => onChange("backgroundColor", value)}
          />
        </div>
      </fieldset>
      <LayerPicker
        layer={effect}
        draft={draft}
        unlockedOptionIDs={EMPTY_UNLOCKS}
        showLegend
        onChange={onChange}
        onChoose={(optionID) => onChange("effect", optionID)}
      />
    </>
  );
}

const COLOR_PRESETS = [
  { value: "#22aacc", label: copy.avatar.palette.colors.aqua },
  { value: "#66d0ff", label: copy.avatar.palette.colors.sky },
  { value: "#6954ee", label: copy.avatar.palette.colors.violet },
  { value: "#241d3d", label: copy.avatar.palette.colors.ink },
  { value: "#c8f52a", label: copy.avatar.palette.colors.lime },
  { value: "#f3ad16", label: copy.avatar.palette.colors.gold },
  { value: "#ff806f", label: copy.avatar.palette.colors.coral },
  { value: "#22a87a", label: copy.avatar.palette.colors.green },
] as const;

function ColorSwatchPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <div className="avatar-color-picker" ref={root}>
      <button
        type="button"
        className="avatar-color-picker__swatch"
        style={{ backgroundColor: value }}
        aria-label={name}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open ? (
        <div className="avatar-color-wheel" role="dialog" aria-label={name}>
          {COLOR_PRESETS.map((preset, index) => (
            <button
              key={preset.value}
              type="button"
              className={`avatar-color-wheel__choice avatar-color-wheel__choice--${index + 1}`}
              style={{ backgroundColor: preset.value }}
              aria-label={preset.label}
              aria-pressed={value === preset.value}
              onClick={() => onChange(preset.value)}
            >
              {value === preset.value ? (
                <span aria-hidden="true">✓</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="avatar-color-wheel__done"
            aria-label={copy.avatar.palette.done}
            onClick={() => setOpen(false)}
          >
            <span aria-hidden="true">✓</span>
          </button>
          <label className="avatar-color-wheel__custom">
            <span aria-hidden="true">✎</span>
            <span className="sr-only">{copy.avatar.palette.custom(name)}</span>
            <input
              type="color"
              value={value}
              aria-label={copy.avatar.palette.custom(name)}
              onInput={(event) => onChange(event.currentTarget.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function Choice({
  layer,
  option,
  draft,
  unlocked,
  onChoose,
}: {
  layer: AvatarLayerDefinition;
  option: AvatarOption;
  draft: AvatarConfiguration;
  unlocked: boolean;
  onChoose(): void;
}) {
  const selected = draft[layer.kind] === option.id;
  const locked = option.unlock === "advancement" && !unlocked;
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

const EMPTY_UNLOCKS = new Set<string>();

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
