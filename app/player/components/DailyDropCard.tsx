"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  connectedDailyDropGateway,
  type DailyDropClaim,
  type DailyDropGateway,
  type DailyDropStatus,
} from "../../data/daily-drop-gateway";
import { playerExperienceCopy } from "../content";

type ClaimPhase = "idle" | "opening" | "error" | "revealed";

export function DailyDropCard({
  connected,
  gateway = connectedDailyDropGateway,
}: {
  connected: boolean;
  gateway?: DailyDropGateway;
}) {
  const copy = playerExperienceCopy.dailyDrop;
  const [status, setStatus] = useState<DailyDropStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [phase, setPhase] = useState<ClaimPhase>("idle");
  const [nextStatus, setNextStatus] = useState<DailyDropStatus | null>(null);
  const claimKey = useRef<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void gateway.status().then(
      (loaded) => {
        if (!active) return;
        setLoadFailed(false);
        setStatus(loaded);
      },
      () => active && setLoadFailed(true),
    );
    return () => {
      active = false;
    };
  }, [connected, gateway, reload]);

  function retryLoad() {
    setLoadFailed(false);
    setStatus(null);
    setReload((current) => current + 1);
  }

  const open = useCallback(async () => {
    if (!status || status.state !== "available" || phase === "opening") return;
    claimKey.current ??= `daily-drop-${status.day}-${crypto.randomUUID()}`;
    setPhase("opening");
    try {
      const claim = await gateway.claim(claimKey.current);
      setStatus(statusFromClaim(claim));
      try {
        setNextStatus(await gateway.status());
      } catch {
        setNextStatus(null);
      }
      setPhase(claim.item ? "revealed" : "idle");
    } catch {
      setPhase("error");
    }
  }, [gateway, phase, status]);

  function openAnother() {
    if (!nextStatus || nextStatus.availableCount < 1) return;
    claimKey.current = null;
    setStatus(nextStatus);
    setNextStatus(null);
    setPhase("idle");
  }

  if (!connected) return null;
  if (loadFailed) {
    return (
      <section className="daily-drop daily-drop--error" aria-label={copy.title}>
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.loadFailed}</h2>
        </div>
        <button
          type="button"
          className="button button--outline"
          onClick={retryLoad}
        >
          {copy.tryAgain}
        </button>
      </section>
    );
  }
  if (!status) {
    return (
      <section className="daily-drop daily-drop--loading" aria-busy="true">
        <span className="daily-drop__parcel" aria-hidden="true" />
        <p>{copy.loading}</p>
      </section>
    );
  }
  if (status.state === "collection_complete") {
    return (
      <section className="daily-drop daily-drop--complete">
        <DropParcel open />
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.collectionComplete}</h2>
          <p>{copy.collectionCompleteBody}</p>
        </div>
      </section>
    );
  }
  if (status.state === "claimed") {
    const item = status.claim.item;
    if (!item) return null;
    const revealed = phase === "revealed";
    return (
      <section
        className={`daily-drop daily-drop--claimed${revealed ? " is-revealed" : ""}`}
      >
        <DropParcel open />
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 role={revealed ? "status" : undefined}>
            {revealed ? copy.unlocked(item.label) : copy.collected}
          </h2>
          {!revealed ? <p>{item.label}</p> : null}
          <p className="daily-drop__destination">
            {item.kind === "avatar_part"
              ? copy.avatarDestination
              : copy.canvasDestination}
          </p>
          {revealed && nextStatus && nextStatus.availableCount > 0 ? (
            <button
              type="button"
              className="button button--lime"
              onClick={openAnother}
            >
              {copy.openAnother}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="daily-drop daily-drop--available">
      <DropParcel />
      <div className="daily-drop__body">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <p className="daily-drop__source">
          {status.nextSource === "plan_participation_3"
            ? copy.earnedThreeDays
            : status.nextSource === "plan_completion_7"
              ? copy.earnedSevenDays
              : copy.availableCount(status.availableCount)}
        </p>
        {phase === "error" ? (
          <p className="daily-drop__error" role="alert">
            {copy.claimFailed}
          </p>
        ) : null}
        <button
          type="button"
          className="button button--lime"
          disabled={phase === "opening"}
          onClick={() => void open()}
        >
          {phase === "opening"
            ? copy.opening
            : phase === "error"
              ? copy.tryOpeningAgain
              : copy.open}
        </button>
      </div>
    </section>
  );
}

function DropParcel({ open = false }: { open?: boolean }) {
  return (
    <span
      className={`daily-drop__parcel${open ? " is-open" : ""}`}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}

function statusFromClaim(claim: DailyDropClaim): DailyDropStatus {
  return claim.item
    ? {
        state: "claimed",
        day: claim.day,
        availableCount: 0,
        pendingPlanBoxes: 0,
        claim,
      }
    : {
        state: "collection_complete",
        day: claim.day,
        availableCount: 0,
        pendingPlanBoxes: 0,
        claim,
      };
}
