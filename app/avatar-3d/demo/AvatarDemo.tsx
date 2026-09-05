"use client";

import { useState } from "react";

import { AvatarStage } from "../AvatarStage";
import { avatar3dCopy } from "../copy";
import type { AvatarMotionState } from "../types";
import styles from "./AvatarDemo.module.css";

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

export function AvatarDemo({ assetURL }: { assetURL: string }) {
  const [selectedID, setSelectedID] =
    useState<(typeof MOTIONS)[number]["id"]>("idle");
  const selected = MOTIONS.find(({ id }) => id === selectedID) ?? MOTIONS[0];
  const copy = avatar3dCopy.demo;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
        </header>

        <section className={styles.workspace} aria-label="3D avatar demo">
          <AvatarStage
            className={styles.stage}
            assetURL={assetURL}
            motion={selected.motion}
          />

          <aside className={styles.panel}>
            <section>
              <h2>{copy.controlsLabel}</h2>
              <div className={styles.controls}>
                {MOTIONS.map(({ id, label }) => (
                  <button
                    className={styles.button}
                    key={id}
                    type="button"
                    aria-pressed={selectedID === id}
                    onClick={() => setSelectedID(id)}
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
                {copy.currentAnimation}: {selected.label}
              </p>
            </section>

            <section className={styles.proof}>
              <h2>{copy.engineeringTitle}</h2>
              <ul>
                {copy.engineeringPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>

            <p className={styles.note}>{copy.referenceNote}</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
