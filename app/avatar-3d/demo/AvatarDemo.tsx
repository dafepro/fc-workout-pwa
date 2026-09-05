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
] as const satisfies readonly { id: AvatarSlot; label: string }[];

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
  const [loadout, setLoadout] = useState(createReferenceLoadout);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>("hair");
  const [selectedMotionID, setSelectedMotionID] = useState("idle");
  const selectedMotion =
    MOTIONS.find(({ id }) => id === selectedMotionID) ?? MOTIONS[0];
  const choices = catalog.items.filter(
    (item) => item.active && item.slot === activeSlot,
  );
  const selectedItem = selectedItemFor(catalog, loadout, activeSlot);
  const selectedVariant = selectionFor(loadout, activeSlot)?.variantId;
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

  function removeHeadwear() {
    setLoadout((current) => {
      const slots = { ...current.slots };
      delete slots.headwear;
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

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 className={styles.title}>{copy.title}</h1>
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
            />
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
          </div>

          <aside className={styles.panel}>
            <div className={styles.panelHeading}>
              <p>{copy.stepLabel}</p>
              <h2>{copy.customizeLabel}</h2>
            </div>

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
                {activeSlot === "headwear" ? (
                  <Choice
                    label={copy.noHeadwear}
                    checked={!loadout.slots.headwear}
                    value="none"
                    name="avatar-headwear"
                    onChange={removeHeadwear}
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

            <p className={styles.note}>{copy.referenceNote}</p>
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

function createReferenceLoadout(): AvatarLoadout {
  return {
    schemaVersion: 1,
    rigVersion: "zoomigo-humanoid-v1",
    baseId: "base.zoomigo.reference",
    appearance: {
      skinToneId: "skin.medium",
      faceId: "face.default",
      hairId: "hair.curl-cloud.reference",
    },
    slots: {
      top: { itemId: "top.training-tee.reference", variantId: "lime" },
      bottom: {
        itemId: "bottom.training-shorts.reference",
        variantId: "violet",
      },
      feet: { itemId: "feet.pitch-runners.reference", variantId: "white" },
    },
    animations: {
      idle: "idle_default",
      celebration: "celebration_jump",
    },
    effects: [],
  };
}
