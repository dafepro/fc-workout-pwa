"use client";

import { useState } from "react";

import { AvatarStage } from "../AvatarStage";
import { avatar3dCopy } from "../copy";
import type {
  AvatarCatalog,
  AvatarCatalogItem,
  AvatarLoadout,
  AvatarMotionState,
  AvatarSlot,
} from "../types";
import styles from "./AvatarDemo.module.css";

const CATEGORIES = [
  { id: "hair", label: "Hair" },
  { id: "top", label: "Tops" },
  { id: "bottom", label: "Bottoms" },
  { id: "feet", label: "Shoes" },
  { id: "headwear", label: "Headwear" },
  { id: "eyewear", label: "Eyewear" },
  { id: "back", label: "Back gear" },
] as const satisfies readonly { id: AvatarSlot; label: string }[];

const OPTIONAL_SLOTS = [
  "headwear",
  "eyewear",
  "back",
] as const satisfies readonly AvatarSlot[];

const VIEWS = [
  { id: "front", label: "Front view", shortLabel: "Front", rotation: 0 },
  {
    id: "three-quarter",
    label: "Three-quarter view",
    shortLabel: "3/4",
    rotation: Math.PI / 4,
  },
  { id: "side", label: "Side view", shortLabel: "Side", rotation: Math.PI / 2 },
  { id: "back", label: "Back view", shortLabel: "Back", rotation: Math.PI },
] as const;

const MOTIONS = [
  { id: "idle", label: "Idle", motion: { kind: "idle" } },
  { id: "walk", label: "Walk", motion: { kind: "walk" } },
  { id: "run", label: "Run", motion: { kind: "run" } },
  {
    id: "celebrate",
    label: "Celebrate",
    motion: {
      kind: "emote",
      clipId: "celebration_jump",
      startedAt: 0,
    },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  motion: AvatarMotionState;
}[];

export function AvatarDemo({
  catalog,
  catalogURL,
}: {
  catalog: AvatarCatalog;
  catalogURL: string;
}) {
  const [loadout, setLoadout] = useState(createEngineeringLoadout);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>("hair");
  const [selectedMotionID, setSelectedMotionID] = useState("idle");
  const [selectedViewID, setSelectedViewID] = useState("three-quarter");
  const selectedMotion =
    MOTIONS.find(({ id }) => id === selectedMotionID) ?? MOTIONS[0];
  const selectedView =
    VIEWS.find(({ id }) => id === selectedViewID) ?? VIEWS[0];
  const choices = catalog.items.filter(
    (item) => item.active && item.slot === activeSlot,
  );
  const selectedItem = selectedItemFor(catalog, loadout, activeSlot);
  const selectedVariant = selectionFor(loadout, activeSlot)?.variantId;
  const skinTones = catalog.colors.filter(({ id }) => id.startsWith("skin."));
  const copy = avatar3dCopy.demo;

  function chooseItem(item: AvatarCatalogItem) {
    setLoadout((current) => {
      const selection = {
        itemId: item.id,
        ...(item.materialMode === "fixed"
          ? {}
          : { variantId: item.variants[0] }),
      };
      if (activeSlot === "hair") {
        return {
          ...current,
          appearance: { ...current.appearance, hairId: item.id },
        };
      }
      return {
        ...current,
        slots: { ...current.slots, [activeSlot]: selection },
      };
    });
  }

  function removeOptionalItem() {
    setLoadout((current) => {
      const slots = { ...current.slots };
      delete slots[activeSlot];
      return { ...current, slots };
    });
  }

  function chooseVariant(variantId: string) {
    if (activeSlot === "hair" || !selectedItem) return;
    setLoadout((current) => ({
      ...current,
      slots: {
        ...current.slots,
        [activeSlot]: { itemId: selectedItem.id, variantId },
      },
    }));
  }

  function chooseSkinTone(skinToneId: string) {
    setLoadout((current) => ({
      ...current,
      appearance: { ...current.appearance, skinToneId },
    }));
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 className={styles.title}>{copy.title}</h1>
            <p className={styles.catalogSummary}>{copy.catalogSummary}</p>
          </div>
          <p className={styles.intro}>{copy.intro}</p>
        </header>

        <section className={styles.workspace} aria-label="3D avatar customizer">
          <div className={styles.previewColumn}>
            <AvatarStage
              className={styles.stage}
              catalogURL={catalogURL}
              loadout={loadout}
              motion={selectedMotion.motion}
              viewRadians={selectedView.rotation}
            />
            <div className={styles.controlDeck}>
              <fieldset className={styles.motionFieldset}>
                <legend>{copy.animationLabel}</legend>
                <div className={styles.motionControls}>
                  {MOTIONS.map(({ id, label }) => (
                    <button
                      className={styles.motionButton}
                      key={id}
                      type="button"
                      aria-pressed={selectedMotionID === id}
                      onClick={() => setSelectedMotionID(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p
                  className={styles.animationState}
                  data-testid="avatar-animation-state"
                  aria-live="polite"
                >
                  {copy.currentAnimation}: {selectedMotion.label}
                </p>
              </fieldset>
              <fieldset className={styles.viewFieldset}>
                <legend>{copy.viewLabel}</legend>
                <div className={styles.viewControls}>
                  {VIEWS.map(({ id, label, shortLabel }) => (
                    <button
                      className={styles.viewButton}
                      key={id}
                      type="button"
                      aria-label={label}
                      aria-pressed={selectedViewID === id}
                      onClick={() => setSelectedViewID(id)}
                    >
                      {shortLabel}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <aside className={styles.panel}>
            <div className={styles.panelHeading}>
              <p>{copy.stepLabel}</p>
              <h2>{copy.customizeLabel}</h2>
            </div>

            <fieldset className={styles.skinFieldset}>
              <legend>{copy.skinToneLabel}</legend>
              <div className={styles.colorChoices}>
                {skinTones.map((tone) => (
                  <label key={tone.id} title={tone.displayName}>
                    <input
                      type="radio"
                      name="avatar-skin-tone"
                      value={tone.id}
                      checked={loadout.appearance.skinToneId === tone.id}
                      aria-label={tone.displayName}
                      onChange={() => chooseSkinTone(tone.id)}
                    />
                    <span style={{ backgroundColor: tone.value }} />
                  </label>
                ))}
              </div>
            </fieldset>

            <nav className={styles.categories} aria-label="Avatar categories">
              {CATEGORIES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeSlot === id}
                  onClick={() => setActiveSlot(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <fieldset className={styles.itemFieldset}>
              <legend>{copy.chooseItem}</legend>
              <div className={styles.itemChoices}>
                {isOptionalSlot(activeSlot) ? (
                  <Choice
                    label={copy.noneLabels[activeSlot]}
                    checked={!loadout.slots[activeSlot]}
                    value="none"
                    name={`avatar-${activeSlot}`}
                    onChange={removeOptionalItem}
                  />
                ) : null}
                {choices.map((item) => (
                  <Choice
                    key={item.id}
                    label={item.displayName}
                    checked={selectedItem?.id === item.id}
                    value={item.id}
                    name={`avatar-${activeSlot}`}
                    onChange={() => chooseItem(item)}
                  />
                ))}
              </div>
            </fieldset>

            {selectedItem && selectedItem.variants.length > 0 ? (
              <fieldset className={styles.colorFieldset}>
                <legend>{copy.chooseColor}</legend>
                <div className={styles.colorChoices}>
                  {selectedItem.variants.map((variantId) => {
                    const color = catalog.colors.find(
                      ({ id }) => id === variantId,
                    );
                    if (!color) return null;
                    return (
                      <label key={color.id} title={color.displayName}>
                        <input
                          type="radio"
                          name={`avatar-${activeSlot}-color`}
                          value={color.id}
                          checked={selectedVariant === color.id}
                          aria-label={color.displayName}
                          onChange={() => chooseVariant(color.id)}
                        />
                        <span style={{ backgroundColor: color.value }} />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {selectedItem?.hideSlots.includes("hair") ? (
              <p className={styles.compatibilityNote}>{copy.hiddenHair}</p>
            ) : null}

            {selectedItem && selectedItem.kind !== "base" ? (
              <p className={styles.itemKind}>
                {copy.itemKinds[selectedItem.kind]}
              </p>
            ) : null}

            <p className={styles.note}>{copy.reviewNote}</p>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Choice({
  label,
  checked,
  value,
  name,
  onChange,
}: {
  label: string;
  checked: boolean;
  value: string;
  name: string;
  onChange(): void;
}) {
  return (
    <label className={styles.itemChoice}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

function selectedItemFor(
  catalog: AvatarCatalog,
  loadout: AvatarLoadout,
  slot: AvatarSlot,
): AvatarCatalogItem | undefined {
  const itemId = selectionFor(loadout, slot)?.itemId;
  return catalog.items.find((item) => item.id === itemId);
}

function selectionFor(loadout: AvatarLoadout, slot: AvatarSlot) {
  return slot === "hair"
    ? { itemId: loadout.appearance.hairId }
    : loadout.slots[slot];
}

function isOptionalSlot(
  slot: AvatarSlot,
): slot is (typeof OPTIONAL_SLOTS)[number] {
  return OPTIONAL_SLOTS.includes(slot as (typeof OPTIONAL_SLOTS)[number]);
}

function createEngineeringLoadout(): AvatarLoadout {
  return {
    schemaVersion: 1,
    rigVersion: "zoomigo-humanoid-v1",
    baseId: "base.zoomigo.player-v1",
    appearance: {
      skinToneId: "skin.04",
      faceId: "face.default",
      hairId: "hair.curl-cloud",
    },
    slots: {
      top: { itemId: "top.striker-jersey", variantId: "navy" },
      bottom: {
        itemId: "bottom.match-shorts",
        variantId: "violet",
      },
      feet: { itemId: "feet.velocity-cleats", variantId: "white" },
    },
    animations: {
      idle: "idle_default",
      celebration: "celebration_jump",
    },
    effects: [],
  };
}
