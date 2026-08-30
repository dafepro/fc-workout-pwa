"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { copy } from "../content/copy";
import { routes } from "../content/routes";
import type {
  PrizeBoxSource,
  PrizeItem,
  PrizeUnlock,
} from "../data/prize-box-gateway";
import { PrizeDialog } from "./PrizeDialog";
import { PrizeItemArt } from "./PrizeItemArt";
import { PrizeRarityBadge } from "./PrizeRarityBadge";

type CollectionStatus = "loading" | "ready" | "error";
type CollectionFilter = "all" | PrizeItem["destination"];
type CollectionView = "collection" | "history";

export function PrizeCollection({
  inventory,
  onMarkViewed,
  onRetry,
  status,
}: {
  inventory: PrizeUnlock[];
  onMarkViewed(itemId: string): Promise<PrizeUnlock>;
  onRetry(): void;
  status: CollectionStatus;
}) {
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [view, setView] = useState<CollectionView>("collection");
  const [selected, setSelected] = useState<PrizeUnlock | null>(null);
  const [viewedItems, setViewedItems] = useState(() => new Set<string>());
  const [markError, setMarkError] = useState(false);
  const [marking, setMarking] = useState(false);
  const filtered = useMemo(
    () =>
      filter === "all"
        ? inventory
        : inventory.filter(({ item }) => item.destination === filter),
    [filter, inventory],
  );
  const grouped = useMemo(() => groupPrizes(filtered), [filtered]);

  async function selectPrize(unlock: PrizeUnlock) {
    setSelected(unlock);
    setMarkError(false);
    if (unlock.viewedAt || viewedItems.has(unlock.item.id) || marking) return;
    setMarking(true);
    try {
      await onMarkViewed(unlock.item.id);
      setViewedItems((current) => new Set(current).add(unlock.item.id));
    } catch {
      setMarkError(true);
    } finally {
      setMarking(false);
    }
  }

  function isNew(unlock: PrizeUnlock) {
    return !unlock.viewedAt && !viewedItems.has(unlock.item.id);
  }

  const hasVisibleItems = filtered.length > 0;

  return (
    <section
      className="prize-collection-browser"
      aria-labelledby="collection-title"
    >
      <div className="prize-section-heading">
        <div>
          <h2 id="collection-title" tabIndex={-1}>
            {copy.prizes.collection}
          </h2>
          <p>{copy.prizes.collectionDetail}</p>
        </div>
      </div>

      <div
        className="prize-collection-tabs"
        aria-label={copy.prizes.collectionView}
      >
        <button
          type="button"
          aria-pressed={view === "collection"}
          onClick={() => setView("collection")}
        >
          {copy.prizes.collectionTab}
        </button>
        <button
          type="button"
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          {copy.prizes.historyTab}
        </button>
      </div>

      <div
        className="prize-collection-filters"
        aria-label={copy.prizes.collectionFilter}
      >
        {(
          [
            ["all", copy.prizes.allFilter],
            ["team_lounge", copy.prizes.loungeFilter],
            ["avatar", copy.prizes.avatarFilter],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <p className="prize-collection-state" role="status">
          {copy.prizes.collectionLoading}
        </p>
      ) : null}
      {status === "error" ? (
        <div
          className="notice notice--error prize-collection-error"
          role="alert"
        >
          <span>{copy.prizes.collectionLoadFailed}</span>
          <button type="button" onClick={onRetry}>
            {copy.prizes.retryCollection}
          </button>
        </div>
      ) : null}
      {status === "ready" && !hasVisibleItems ? (
        <p className="prize-empty">{copy.prizes.emptyCollection}</p>
      ) : null}

      {status !== "loading" && hasVisibleItems && view === "collection" ? (
        <ul
          className="prize-collection-grid"
          aria-label={copy.prizes.collection}
        >
          {grouped.map(({ count, unlock }) => (
            <li key={unlock.item.id}>
              <button
                type="button"
                className={`prize-collection-card rarity-${unlock.item.rarity}`}
                aria-label={copy.prizes.viewItem(unlock.item.label)}
                onClick={() => void selectPrize(unlock)}
              >
                <span className="prize-collection-card__art">
                  <PrizeItemArt item={unlock.item} />
                  {isNew(unlock) ? (
                    <span className="prize-new">{copy.prizes.newItem}</span>
                  ) : null}
                </span>
                <strong>
                  {unlock.item.label}
                  {count > 1 ? ` ×${count}` : ""}
                </strong>
                <span className="prize-collection-card__meta">
                  <PrizeRarityBadge rarity={unlock.item.rarity} />
                  <small>{destinationLabel(unlock.item)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {status !== "loading" && hasVisibleItems && view === "history" ? (
        <ol className="prize-history" aria-label={copy.prizes.historyTab}>
          {filtered.map((unlock) => (
            <li key={`${unlock.item.id}-${unlock.unlockedAt}`}>
              <PrizeItemArt item={unlock.item} />
              <span>
                <strong>{unlock.item.label}</strong>
                <small>{historySourceLabel(unlock.source)}</small>
              </span>
              <time dateTime={unlock.unlockedAt}>
                {formatDate(unlock.unlockedAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}

      {selected ? (
        <PrizeDialog
          labelledBy="prize-detail-title"
          onClose={() => {
            setSelected(null);
            setMarkError(false);
          }}
        >
          <PrizeItemArt item={selected.item} featured />
          {isNew(selected) ? (
            <span className="prize-new">{copy.prizes.newItem}</span>
          ) : null}
          <h2 id="prize-detail-title">{selected.item.label}</h2>
          <p className="prize-detail-meta">
            <PrizeRarityBadge rarity={selected.item.rarity} />
            <span>{destinationLabel(selected.item)}</span>
          </p>
          {markError ? (
            <p className="notice notice--error" role="alert">
              {copy.prizes.markViewedFailed}
            </p>
          ) : null}
          <Link
            className="button button--lime"
            href={destinationHref(selected.item)}
          >
            {destinationAction(selected.item)}
          </Link>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSelected(null);
              setMarkError(false);
            }}
          >
            {copy.prizes.closeDetail}
          </button>
        </PrizeDialog>
      ) : null}
    </section>
  );
}

function groupPrizes(inventory: PrizeUnlock[]) {
  const groups = new Map<string, { unlock: PrizeUnlock; count: number }>();
  for (const unlock of inventory) {
    const current = groups.get(unlock.item.id);
    if (current) current.count += 1;
    else groups.set(unlock.item.id, { unlock, count: 1 });
  }
  return [...groups.values()];
}

function historySourceLabel(source: PrizeBoxSource) {
  return copy.prizes.historySources[source];
}

function destinationLabel(item: PrizeItem) {
  return item.destination === "avatar"
    ? copy.prizes.avatarFilter
    : copy.prizes.loungeFilter;
}

function destinationHref(item: PrizeItem) {
  return item.destination === "avatar"
    ? routes.playerAvatar
    : routes.playerTeam;
}

function destinationAction(item: PrizeItem) {
  return item.destination === "avatar"
    ? copy.prizes.useInAvatar
    : copy.prizes.useInLounge;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
