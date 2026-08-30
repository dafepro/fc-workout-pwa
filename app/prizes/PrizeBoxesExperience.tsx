"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../content/copy";
import { routes } from "../content/routes";
import type {
  PrizeBox,
  PrizeBoxClaim,
  PrizeBoxGateway,
  PrizeBoxOverview,
  PrizeItem,
  PrizeUnlock,
} from "../data/prize-box-gateway";
import { PrizeItemArt } from "./PrizeItemArt";

export function PrizeBoxesExperience({
  gateway,
}: {
  gateway: PrizeBoxGateway;
}) {
  const [overview, setOverview] = useState<PrizeBoxOverview | null>(null);
  const [inventory, setInventory] = useState<PrizeUnlock[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [reveal, setReveal] = useState<PrizeBoxClaim | null>(null);
  const claimKey = useRef("");
  const openKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [nextOverview, nextInventory] = await Promise.all([
        gateway.overview(),
        gateway.inventory(),
      ]);
      setOverview(nextOverview);
      setInventory(nextInventory);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    Promise.all([gateway.overview(), gateway.inventory()])
      .then(([nextOverview, nextInventory]) => {
        if (!active) return;
        setOverview(nextOverview);
        setInventory(nextInventory);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [gateway]);

  async function claimDaily() {
    if (!overview || busy) return;
    claimKey.current ||= crypto.randomUUID();
    setBusy(true);
    setActionError(false);
    try {
      const box = await gateway.claimDaily(claimKey.current);
      claimKey.current = "";
      setOverview({
        ...overview,
        dailyState: "claimed",
        readyCount: overview.readyCount + 1,
        earnedTotal: overview.earnedTotal + 1,
        unopened: [...overview.unopened, box],
      });
      setRetry(null);
    } catch {
      setActionError(true);
      setRetry(() => claimDaily);
    } finally {
      setBusy(false);
    }
  }

  async function openBox(box: PrizeBox) {
    if (!overview || busy) return;
    const key = openKeys.current.get(box.id) ?? crypto.randomUUID();
    openKeys.current.set(box.id, key);
    setBusy(true);
    setActionError(false);
    try {
      const claim = await gateway.open(box.id, key);
      openKeys.current.delete(box.id);
      const unlocked = claim.item
        ? { item: claim.item, source: claim.source, unlockedAt: claim.openedAt }
        : null;
      setOverview({
        ...overview,
        readyCount: Math.max(0, overview.readyCount - 1),
        openedTotal: overview.openedTotal + 1,
        unopened: overview.unopened.filter(({ id }) => id !== box.id),
        recent: unlocked ? [unlocked, ...overview.recent] : overview.recent,
      });
      if (unlocked) setInventory((items) => [unlocked, ...items]);
      setReveal(claim);
      setRetry(null);
    } catch {
      setActionError(true);
      setRetry(() => () => void openBox(box));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <div className="prize-state">{copy.prizes.loading}</div>;
  }
  if (status === "error" || !overview) {
    return (
      <div className="prize-state" role="alert">
        <p>{copy.prizes.loadFailed}</p>
        <button className="button button--lime" onClick={() => void load()}>
          {copy.prizes.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="prize-experience">
      <Link className="prize-back" href={routes.playerHome}>
        ← {copy.prizes.back}
      </Link>
      <header className="prize-header">
        <p className="eyebrow eyebrow--lime">{copy.prizes.eyebrow}</p>
        <h1>{copy.prizes.title}</h1>
        <p>{copy.prizes.intro}</p>
        <dl className="prize-counts">
          <div>
            <dt>{copy.prizes.ready}</dt>
            <dd>{overview.readyCount}</dd>
          </div>
          <div>
            <dt>{copy.prizes.opened}</dt>
            <dd>{overview.openedTotal}</dd>
          </div>
          <div>
            <dt>{copy.prizes.collected}</dt>
            <dd>{inventory.length}</dd>
          </div>
        </dl>
      </header>

      {actionError ? (
        <div className="notice notice--error prize-error" role="alert">
          <strong>{copy.prizes.actionFailed}</strong>
          {retry ? (
            <button type="button" onClick={retry}>
              {copy.prizes.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="card prize-daily" aria-labelledby="daily-prize-title">
        <div className="prize-box-art" aria-hidden="true">
          <span>✦</span>
        </div>
        <div>
          <p className="eyebrow">{copy.prizes.dailyEyebrow}</p>
          <h2 id="daily-prize-title">{dailyTitle(overview.dailyState)}</h2>
          <p>{dailyDetail(overview.dailyState)}</p>
          {overview.dailyState === "available" ? (
            <button
              className="button button--lime"
              disabled={busy}
              onClick={() => void claimDaily()}
            >
              {busy ? copy.prizes.claiming : copy.prizes.claim}
            </button>
          ) : null}
        </div>
      </section>

      <section className="prize-section" aria-labelledby="ready-boxes-title">
        <h2 id="ready-boxes-title">{readyLabel(overview.readyCount)}</h2>
        {overview.unopened.length ? (
          <ul className="prize-ready-list">
            {overview.unopened.map((box) => (
              <li className="card" key={box.id}>
                <div
                  className="prize-box-art prize-box-art--small"
                  aria-hidden="true"
                >
                  <span>✦</span>
                </div>
                <div>
                  <strong>{sourceLabel(box.source)}</strong>
                  <small>{copy.prizes.sealed}</small>
                </div>
                <button
                  className="button button--purple"
                  disabled={busy}
                  onClick={() => void openBox(box)}
                >
                  {busy ? copy.prizes.opening : copy.prizes.open}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prize-empty">{copy.prizes.noBoxes}</p>
        )}
      </section>

      <section className="prize-section" aria-labelledby="collection-title">
        <h2 id="collection-title">{copy.prizes.collection}</h2>
        <p>{copy.prizes.collectionDetail}</p>
        {inventory.length ? (
          <ul className="prize-collection">
            {inventory.map((entry) => (
              <li className="card" key={entry.item.id}>
                <PrizeItemArt item={entry.item} />
                <div>
                  <strong>{entry.item.label}</strong>
                  <small>
                    {rarityLabel(entry.item.rarity)} ·{" "}
                    {sourceLabel(entry.source)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prize-empty">{copy.prizes.emptyCollection}</p>
        )}
      </section>

      {reveal ? (
        <div className="prize-dialog-backdrop">
          <section
            className="prize-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prize-reveal-title"
          >
            {reveal.item ? <PrizeItemArt item={reveal.item} featured /> : null}
            <p className="eyebrow eyebrow--lime">{copy.prizes.revealEyebrow}</p>
            <h2 id="prize-reveal-title">
              {reveal.item?.label ?? copy.prizes.collectionComplete}
            </h2>
            {reveal.item ? (
              <>
                <p>{rarityLabel(reveal.item.rarity)}</p>
                <Link
                  className="button button--lime"
                  href={destinationHref(reveal.item)}
                >
                  {destinationLabel(reveal.item)}
                </Link>
              </>
            ) : null}
            <button
              className="text-button"
              type="button"
              onClick={() => setReveal(null)}
            >
              {copy.prizes.close}
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function readyLabel(count: number) {
  return `${count} ${count === 1 ? "box" : "boxes"} ready`;
}

function dailyTitle(state: PrizeBoxOverview["dailyState"]) {
  if (state === "available") return copy.prizes.dailyAvailable;
  if (state === "collection_complete") return copy.prizes.collectionComplete;
  return copy.prizes.dailyClaimed;
}

function dailyDetail(state: PrizeBoxOverview["dailyState"]) {
  if (state === "available") return copy.prizes.dailyAvailableDetail;
  if (state === "collection_complete")
    return copy.prizes.collectionCompleteDetail;
  return copy.prizes.dailyClaimedDetail;
}

function sourceLabel(source: PrizeBox["source"]) {
  return copy.prizes.sources[source];
}

function rarityLabel(rarity: PrizeItem["rarity"]) {
  return copy.prizes.rarities[rarity];
}

function destinationHref(item: PrizeItem) {
  return item.destination === "avatar" ? routes.playerAvatar : "/team";
}

function destinationLabel(item: PrizeItem) {
  return item.destination === "avatar"
    ? copy.prizes.useInAvatar
    : copy.prizes.useInLounge;
}
