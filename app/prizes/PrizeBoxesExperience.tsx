"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  connectedPrizeBoxGateway,
  type OpenedPrizeBox,
  type PrizeBox,
  type PrizeBoxGateway,
  type PrizeBoxOverview,
  type PrizeBoxSource,
} from "../data/prize-box-gateway";
import { PrizeBoxVisual, PrizeItemArt } from "./PrizeItemArt";
import { prizeBoxCopy, rarityLabel } from "./content";
import { useOptionalAnalytics } from "../../lib/analytics/AnalyticsProvider";

export function PrizeBoxesExperience({
  connected,
  gateway = connectedPrizeBoxGateway,
}: {
  connected: boolean;
  gateway?: PrizeBoxGateway;
}) {
  const [overview, setOverview] = useState<PrizeBoxOverview | null>(null);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(false);
  const [claimConfirmed, setClaimConfirmed] = useState(false);
  const [openingID, setOpeningID] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);
  const [reveal, setReveal] = useState<OpenedPrizeBox | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const claimKey = useRef<string | null>(null);
  const openKeys = useRef(new Map<string, string>());

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void gateway.overview().then(
      (next) => {
        if (!active) return;
        setOverview(next);
        setLoadingFailed(false);
      },
      () => active && setLoadingFailed(true),
    );
    return () => {
      active = false;
    };
  }, [connected, gateway, reload]);

  useEffect(() => {
    if (!helpOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHelpOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen]);

  async function claimDaily() {
    if (!overview || overview.dailyState !== "available" || claiming) return;
    claimKey.current ??= `prize-daily-${overview.day}-${crypto.randomUUID()}`;
    setClaiming(true);
    setClaimError(false);
    try {
      const box = await gateway.claimDaily(claimKey.current);
      setOverview(addClaimedBox(overview, box));
      setClaimConfirmed(true);
    } catch {
      setClaimError(true);
    } finally {
      setClaiming(false);
    }
  }

  async function openBox(box: PrizeBox) {
    if (openingID) return;
    const key =
      openKeys.current.get(box.id) ??
      `prize-open-${box.id}-${crypto.randomUUID()}`;
    openKeys.current.set(box.id, key);
    setOpeningID(box.id);
    setOpenError(false);
    try {
      const opened = await gateway.open(box.id, key);
      setReveal(opened);
      try {
        setOverview(await gateway.overview());
      } catch {
        setOverview((current) =>
          current ? removeOpenedBox(current, box.id) : current,
        );
      }
    } catch {
      setOpenError(true);
    } finally {
      setOpeningID(null);
    }
  }

  if (!connected) {
    return (
      <p className="prize-boxes-state">
        Prize boxes require a connected player session.
      </p>
    );
  }

  return (
    <div className="prize-boxes-experience">
      <Link className="secondary-page-back" href="/">
        <span aria-hidden="true">←</span> {prizeBoxCopy.back}
      </Link>
      <header className="prize-boxes-header">
        <div>
          <p className="player-eyebrow">{prizeBoxCopy.eyebrow}</p>
          <h1>{prizeBoxCopy.title}</h1>
          <p>{prizeBoxCopy.subtitle}</p>
        </div>
        <Image
          className="prize-boxes-header__zoomi"
          src="/rewards/zoomi-found-box-v2.png"
          alt="Zoomi the Dalmatian beside a prize box"
          width={192}
          height={128}
          priority
          unoptimized
        />
        <button
          type="button"
          className="prize-boxes-help"
          aria-label={prizeBoxCopy.help}
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
      </header>

      {loadingFailed ? (
        <section className="prize-boxes-state" role="alert">
          <p>{prizeBoxCopy.errors.load}</p>
          <button
            type="button"
            className="button button--outline"
            onClick={() => {
              setLoadingFailed(false);
              setReload((value) => value + 1);
            }}
          >
            {prizeBoxCopy.errors.retry}
          </button>
        </section>
      ) : !overview ? (
        <section className="prize-boxes-state" aria-busy="true">
          Checking your boxes…
        </section>
      ) : (
        <>
          <DailyFreeBox
            overview={overview}
            claiming={claiming}
            confirmed={claimConfirmed}
            error={claimError}
            onClaim={() => void claimDaily()}
          />
          <UnopenedPool
            boxes={overview.unopened}
            openingID={openingID}
            error={openError}
            onOpen={(box) => void openBox(box)}
          />
          <RecentPrizes overview={overview} />
        </>
      )}
      {reveal ? (
        <PrizeReveal reveal={reveal} onClose={() => setReveal(null)} />
      ) : null}
      {helpOpen
        ? createPortal(
            <PrizeHelpModal onClose={() => setHelpOpen(false)} />,
            document.body,
          )
        : null}
    </div>
  );
}

function PrizeHelpModal({ onClose }: { onClose(): void }) {
  return (
    <section
      className="prize-help-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prize-help-title"
    >
      <div className="prize-help-modal__panel">
        <header>
          <h2 id="prize-help-title">{prizeBoxCopy.help}</h2>
          <button type="button" autoFocus onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">{prizeBoxCopy.closeHelp}</span>
          </button>
        </header>
        <ol>
          {prizeBoxCopy.helpItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DailyFreeBox({
  overview,
  claiming,
  confirmed,
  error,
  onClaim,
}: {
  overview: PrizeBoxOverview;
  claiming: boolean;
  confirmed: boolean;
  error: boolean;
  onClaim(): void;
}) {
  const claimed = overview.dailyState === "claimed";
  return (
    <section className={`daily-free-box${claimed ? " is-claimed" : ""}`}>
      <div>
        <p className="eyebrow">{prizeBoxCopy.daily.eyebrow}</p>
        <h2>
          {claimed
            ? prizeBoxCopy.daily.claimed
            : overview.dailyState === "collection_complete"
              ? prizeBoxCopy.daily.complete
              : prizeBoxCopy.daily.available}
        </h2>
        <p>
          {claimed
            ? prizeBoxCopy.daily.claimedBody
            : overview.dailyState === "collection_complete"
              ? prizeBoxCopy.daily.completeBody
              : prizeBoxCopy.daily.body}
        </p>
        {error ? (
          <p className="prize-boxes-error" role="alert">
            {prizeBoxCopy.errors.claim}
          </p>
        ) : null}
        {overview.dailyState === "available" ? (
          <button
            type="button"
            className="button button--lime"
            disabled={claiming}
            onClick={onClaim}
          >
            {claiming ? prizeBoxCopy.daily.claiming : prizeBoxCopy.daily.claim}
          </button>
        ) : null}
        {confirmed ? (
          <span className="sr-only" role="status">
            {prizeBoxCopy.daily.claimed} — {prizeBoxCopy.daily.claimedBody}
          </span>
        ) : null}
      </div>
      <PrizeBoxVisual />
    </section>
  );
}

function UnopenedPool({
  boxes,
  openingID,
  error,
  onOpen,
}: {
  boxes: PrizeBox[];
  openingID: string | null;
  error: boolean;
  onOpen(box: PrizeBox): void;
}) {
  const groups = useMemo(() => groupBoxes(boxes), [boxes]);
  return (
    <section className="prize-unopened">
      <div className="prize-section-heading">
        <h2>{prizeBoxCopy.boxes.title}</h2>
        {boxes.length > 0 ? <span>{boxes.length} waiting</span> : null}
      </div>
      {groups.length ? (
        <div className="prize-unopened__rail">
          {groups.map((group) => (
            <button
              key={group.source}
              type="button"
              className="prize-box-stack"
              disabled={openingID !== null}
              aria-label={`Open ${sourceLabel(group.source)} box`}
              onClick={() => onOpen(group.boxes[0])}
            >
              <span className="prize-box-stack__visual">
                <PrizeBoxVisual />
                <b>{group.boxes.length}</b>
              </span>
              <strong>{sourceLabel(group.source)}</strong>
              <small>
                {openingID === group.boxes[0].id
                  ? prizeBoxCopy.boxes.opening
                  : `${group.boxes.length} to open`}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="prize-unopened__empty">{prizeBoxCopy.boxes.empty}</p>
      )}
      <p className="prize-unopened__hint">{prizeBoxCopy.boxes.hint}</p>
      {error ? (
        <p className="prize-boxes-error" role="alert">
          {prizeBoxCopy.errors.open}
        </p>
      ) : null}
    </section>
  );
}

function RecentPrizes({ overview }: { overview: PrizeBoxOverview }) {
  return (
    <section className="prize-recent">
      <div className="prize-section-heading">
        <h2>{prizeBoxCopy.recent.title}</h2>
      </div>
      {overview.recent.length ? (
        <ul>
          {overview.recent.map(({ item, unlockedAt }) => (
            <li key={`${item.id}-${unlockedAt}`}>
              <PrizeItemArt item={item} />
              <span>
                <strong>{item.label}</strong>
                <small>
                  {rarityLabel(item.rarity)} ·{" "}
                  {destinationLabel(item.destination)}
                </small>
              </span>
              <time dateTime={unlockedAt}>{relativeEarnedAt(unlockedAt)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="prize-recent__empty">{prizeBoxCopy.recent.empty}</p>
      )}
      <Link className="prize-view-all" href="/prizes/all">
        {prizeBoxCopy.recent.all}
        <span aria-hidden="true">›</span>
      </Link>
    </section>
  );
}

function PrizeReveal({
  reveal,
  onClose,
}: {
  reveal: OpenedPrizeBox;
  onClose(): void;
}) {
  const item = reveal.item;
  const analytics = useOptionalAnalytics();
  return (
    <section
      className="prize-reveal"
      role="dialog"
      aria-modal="true"
      aria-label={prizeBoxCopy.reveal.title}
    >
      <div className="prize-reveal__panel">
        <p className="player-eyebrow">{prizeBoxCopy.eyebrow}</p>
        <h2>{prizeBoxCopy.reveal.title}</h2>
        <p>
          {reveal.source === "daily_check_in"
            ? prizeBoxCopy.reveal.daily
            : prizeBoxCopy.reveal.workout}
        </p>
        {item ? (
          <>
            <PrizeItemArt item={item} />
            <span className={`prize-rarity prize-rarity--${item.rarity}`}>
              {rarityLabel(item.rarity)}
            </span>
            <h3 role="status">{item.label}</h3>
            <p className="prize-reveal__destination">
              {destinationLabel(item.destination)}
            </p>
            <Link
              className="button button--lime"
              href={item.destination === "team_lounge" ? "/team" : "/me/avatar"}
              onClick={() =>
                analytics?.track("reward_destination_opened", {
                  destination: item.destination,
                  item_kind:
                    item.kind === "canvas_stamp"
                      ? "stamp"
                      : item.kind === "canvas_prop"
                        ? "prop"
                        : "avatar_part",
                })
              }
            >
              {item.destination === "team_lounge"
                ? prizeBoxCopy.reveal.useTeam
                : prizeBoxCopy.reveal.useAvatar}
            </Link>
          </>
        ) : (
          <p role="status">{prizeBoxCopy.reveal.complete}</p>
        )}
        <button type="button" className="prize-reveal__close" onClick={onClose}>
          {prizeBoxCopy.reveal.collection}
        </button>
      </div>
    </section>
  );
}

function groupBoxes(boxes: PrizeBox[]) {
  const groups = new Map<PrizeBoxSource, PrizeBox[]>();
  for (const box of boxes)
    groups.set(box.source, [...(groups.get(box.source) ?? []), box]);
  return [...groups].map(([source, grouped]) => ({ source, boxes: grouped }));
}

function sourceLabel(source: PrizeBoxSource) {
  if (source === "daily_check_in") return prizeBoxCopy.source.daily;
  if (source === "plan_completion_7") return prizeBoxCopy.source.fullPlan;
  return prizeBoxCopy.source.workout;
}

function destinationLabel(destination: "avatar" | "team_lounge") {
  return destination === "team_lounge"
    ? prizeBoxCopy.reveal.team
    : prizeBoxCopy.reveal.avatar;
}

function addClaimedBox(
  overview: PrizeBoxOverview,
  box: PrizeBox,
): PrizeBoxOverview {
  return {
    ...overview,
    dailyState: "claimed",
    readyCount: overview.readyCount + 1,
    earnedTotal: overview.earnedTotal + 1,
    unopened: [...overview.unopened, box],
  };
}

function removeOpenedBox(
  overview: PrizeBoxOverview,
  boxID: string,
): PrizeBoxOverview {
  const unopened = overview.unopened.filter(({ id }) => id !== boxID);
  return {
    ...overview,
    readyCount: unopened.length,
    openedTotal: overview.openedTotal + 1,
    unopened,
  };
}

function relativeEarnedAt(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (elapsed < 60 * 60 * 1000) return "Just now";
  if (elapsed < 24 * 60 * 60 * 1000) return "Today";
  if (elapsed < 48 * 60 * 60 * 1000) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
