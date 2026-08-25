"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  loadUnlockInventory,
  type PlayerUnlock,
} from "../data/unlock-inventory-gateway";
import type { PrizeDestination } from "../data/prize-box-gateway";
import { PrizeItemArt } from "./PrizeItemArt";
import { rarityLabel } from "./content";

type CollectionFilter = "all" | PrizeDestination;
type CollectionView = "collection" | "history";

export interface PrizeCollectionGateway {
  load(): Promise<PlayerUnlock[]>;
}

const connectedPrizeCollectionGateway: PrizeCollectionGateway = {
  async load() {
    const [team, avatar] = await Promise.all([
      loadUnlockInventory("canvas_stamp"),
      loadUnlockInventory("avatar_part"),
    ]);
    return [...team, ...avatar].sort(
      (left, right) =>
        Date.parse(right.unlockedAt) - Date.parse(left.unlockedAt),
    );
  },
};

export function PrizeCollection({
  connected,
  gateway = connectedPrizeCollectionGateway,
}: {
  connected: boolean;
  gateway?: PrizeCollectionGateway;
}) {
  const [items, setItems] = useState<PlayerUnlock[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    connected ? "loading" : "ready",
  );
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [view, setView] = useState<CollectionView>("collection");

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void gateway.load().then(
      (next) => {
        if (!active) return;
        setItems(next);
        setState("ready");
      },
      () => active && setState("error"),
    );
    return () => {
      active = false;
    };
  }, [connected, gateway]);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter(({ item }) => item.destination === filter),
    [filter, items],
  );
  const grouped = useMemo(() => groupPrizes(filtered), [filtered]);

  return (
    <main className="prize-collection">
      <Link className="prize-collection__back" href="/prizes">
        <span aria-hidden="true">←</span> Prize boxes
      </Link>
      <header>
        <p className="prize-eyebrow">Rewards</p>
        <h1>All prizes</h1>
        <p>See what you own and where every item can be used.</p>
      </header>

      <div className="prize-collection__view-tabs" aria-label="Prize view">
        <button
          type="button"
          aria-pressed={view === "collection"}
          onClick={() => setView("collection")}
        >
          Collection
        </button>
        <button
          type="button"
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          History
        </button>
      </div>

      <div className="prize-collection__filters" aria-label="Prize category">
        {(
          [
            ["all", "All"],
            ["team_lounge", "Team Lounge"],
            ["avatar", "Avatar"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {state === "loading" ? <p role="status">Loading your prizes…</p> : null}
      {state === "error" ? (
        <p role="alert">Your prizes could not be loaded. Try again.</p>
      ) : null}
      {state === "ready" && filtered.length === 0 ? (
        <section className="prize-collection__empty">
          <h2>No prizes here yet</h2>
          <p>Open a prize box and the item will join this collection.</p>
        </section>
      ) : null}

      {state === "ready" && view === "collection" && grouped.length > 0 ? (
        <ul className="prize-collection__grid" aria-label="Prize collection">
          {grouped.map(({ unlock, count }) => (
            <li
              key={unlock.item.id}
              className={`prize-collection__tile rarity-${unlock.item.rarity}`}
            >
              <PrizeItemArt item={unlock.item} />
              <strong>
                {unlock.item.label}
                {count > 1 ? ` ×${count}` : ""}
              </strong>
              <span className="prize-rarity">
                {rarityLabel(unlock.item.rarity)}
              </span>
              <small>{destinationLabel(unlock.item.destination)}</small>
              <Link href={destinationHref(unlock.item.destination)}>
                Use in {destinationLabel(unlock.item.destination)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {state === "ready" && view === "history" && filtered.length > 0 ? (
        <ol className="prize-history" aria-label="Prize history">
          {filtered.map((unlock) => (
            <li key={`${unlock.item.id}-${unlock.unlockedAt}`}>
              <PrizeItemArt item={unlock.item} />
              <span>
                <strong>{unlock.item.label}</strong>
                <small>{sourceLabel(unlock.source)}</small>
              </span>
              <span className="prize-history__meta">
                <span className="prize-rarity">
                  {rarityLabel(unlock.item.rarity)}
                </span>
                <time dateTime={unlock.unlockedAt}>
                  {formatDate(unlock.unlockedAt)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}

function groupPrizes(items: PlayerUnlock[]) {
  const groups = new Map<string, { unlock: PlayerUnlock; count: number }>();
  for (const unlock of items) {
    const current = groups.get(unlock.item.id);
    if (current) current.count += 1;
    else groups.set(unlock.item.id, { unlock, count: 1 });
  }
  return [...groups.values()];
}

function destinationLabel(destination: PrizeDestination) {
  return destination === "team_lounge" ? "Team Lounge" : "Avatar";
}

function destinationHref(destination: PrizeDestination) {
  return destination === "team_lounge" ? "/team" : "/me/avatar";
}

function sourceLabel(source: string) {
  if (source === "daily_drop" || source === "daily_check_in")
    return "From daily box";
  if (source === "plan_participation_3") return "From 3-day plan participation";
  if (source === "plan_completion_7") return "From full plan completion";
  return "From a prize box";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
