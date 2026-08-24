"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "../content/copy";
import { AvatarArt, AvatarPartArt } from "./AvatarArt";
import { AVATAR_CATEGORIES, AVATAR_LAYERS } from "./catalog";
import {
  defaultAvatar,
  layerPalette,
  migrateAvatarConfiguration,
  normalizeAvatar,
} from "./config";
import type {
  AvatarCategoryKind,
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
  AvatarPaletteKey,
} from "./types";
import type { PlayerUnlock } from "../data/unlock-inventory-gateway";

type SaveStatus = "idle" | "saving" | "error";

export function AvatarBuilder({
  config,
  onSave,
  inventory = { state: "ready", items: [] },
  onViewUnlocks,
}: {
  config: AvatarConfiguration;
  onSave(config: AvatarConfiguration): Promise<void>;
  inventory?: UnlockInventoryState;
  onViewUnlocks?(itemIDs: string[]): void | Promise<void>;
}) {
  const startingConfig = migrateAvatarConfiguration(config) ?? defaultAvatar();

  return (
    <AvatarBuilderEditor
      key={configurationKey(startingConfig)}
      startingConfig={startingConfig}
      onSave={onSave}
      inventory={inventory}
      onViewUnlocks={onViewUnlocks}
    />
  );
}

function AvatarBuilderEditor({
  startingConfig,
  onSave,
  inventory,
  onViewUnlocks,
}: {
  startingConfig: AvatarConfiguration;
  onSave(config: AvatarConfiguration): Promise<void>;
  inventory: UnlockInventoryState;
  onViewUnlocks?(itemIDs: string[]): void | Promise<void>;
}) {
  const [draft, setDraft] = useState<AvatarConfiguration>(startingConfig);
  const [activeCategory, setActiveCategory] =
    useState<AvatarCategoryKind>("head");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const category = AVATAR_CATEGORIES.find(({ id }) => id === activeCategory)!;
  const dirty = configurationKey(draft) !== configurationKey(startingConfig);
  const acknowledged = useRef(new Set<string>());

  function openCategory(id: AvatarCategoryKind) {
    setActiveCategory(id);
    if (inventory.state !== "ready" || !onViewUnlocks) return;
    const opened = AVATAR_CATEGORIES.find((candidate) => candidate.id === id)!;
    const itemIDs = inventory.items
      .filter(
        ({ item, viewedAt }) =>
          !viewedAt &&
          opened.layerKinds.includes(
            item.slot as AvatarLayerDefinition["kind"],
          ) &&
          !acknowledged.current.has(item.id),
      )
      .map(({ item }) => item.id);
    if (itemIDs.length === 0) return;
    itemIDs.forEach((itemID) => acknowledged.current.add(itemID));
    void Promise.resolve(onViewUnlocks(itemIDs)).catch(() => {
      itemIDs.forEach((itemID) => acknowledged.current.delete(itemID));
    });
  }

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
            onClick={() => openCategory(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {inventory.state !== "ready" ? (
        <p className="avatar-builder__inventory-status" role="status">
          {inventory.state === "loading"
            ? copy.avatar.inventoryLoading
            : copy.avatar.inventoryFailed}
        </p>
      ) : null}

      <div className="avatar-builder__layer">
        {activeCategory === "background" ? (
          <BackgroundControls
            draft={draft}
            inventory={inventory}
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
                showLegend={category.layerKinds.length > 1}
                onChange={update}
                onChoose={(optionID) => update(kind, optionID)}
                inventory={inventory}
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
  onChange,
  onChoose,
  inventory,
}: {
  layer: AvatarLayerDefinition;
  draft: AvatarConfiguration;
  showLegend: boolean;
  onChange(key: string, value: string): void;
  onChoose(optionID: string): void;
  inventory: UnlockInventoryState;
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
            onChoose={() => onChoose(option.id)}
            inventory={inventory}
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
  inventory,
  onChange,
}: {
  draft: AvatarConfiguration;
  inventory: UnlockInventoryState;
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
        showLegend
        onChange={onChange}
        onChoose={(optionID) => onChange("effect", optionID)}
        inventory={inventory}
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
  onChoose,
  inventory,
}: {
  layer: AvatarLayerDefinition;
  option: AvatarOption;
  draft: AvatarConfiguration;
  onChoose(): void;
  inventory: UnlockInventoryState;
}) {
  const selected = draft[layer.kind] === option.id;
  const earned = inventory.items.find(
    ({ item }) => item.slot === layer.kind && item.assetId === option.id,
  );
  const locked = option.unlock !== undefined && !earned;
  const isNew = Boolean(earned && !earned.viewedAt);
  const accessibleName = locked
    ? `${option.label}, ${copy.avatar.locked}`
    : isNew
      ? `${option.label}, ${copy.avatar.newReward}`
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
        {isNew ? (
          <span className="avatar-choice__new" aria-hidden="true">
            {copy.avatar.newReward}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export type UnlockInventoryState =
  | { state: "loading"; items: [] }
  | { state: "error"; items: [] }
  | { state: "ready"; items: PlayerUnlock[] };

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
