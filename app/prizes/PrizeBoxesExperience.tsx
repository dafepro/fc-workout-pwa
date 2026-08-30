"use client";

import Image from "next/image";
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
import { PrizeCollection } from "./PrizeCollection";
import { PrizeDialog } from "./PrizeDialog";
import { PrizeItemArt } from "./PrizeItemArt";
import { PrizeRarityBadge } from "./PrizeRarityBadge";

type LoadStatus = "loading" | "ready" | "error";

export function PrizeBoxesExperience({
  gateway,
}: {
  gateway: PrizeBoxGateway;
}) {
  const [overview, setOverview] = useState<PrizeBoxOverview | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<LoadStatus>("loading");
  const [inventory, setInventory] = useState<PrizeUnlock[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<LoadStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [reveal, setReveal] = useState<PrizeBoxClaim | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const claimKey = useRef("");
  const openKeys = useRef(new Map<string, string>());

  const loadOverview = useCallback(async () => {
    setOverviewStatus("loading");
    try {
      setOverview(await gateway.overview());
      setOverviewStatus("ready");
    } catch {
      setOverviewStatus("error");
    }
  }, [gateway]);

  const loadInventory = useCallback(async () => {
    setInventoryStatus("loading");
    try {
      const next = await gateway.inventory();
      setInventory((current) => mergeInventory(next, current));
      setInventoryStatus("ready");
    } catch {
      setInventoryStatus("error");
    }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    void gateway.overview().then(
      (next) => {
        if (!active) return;
        setOverview(next);
        setOverviewStatus("ready");
      },
      () => active && setOverviewStatus("error"),
    );
    void gateway.inventory().then(
      (next) => {
        if (!active) return;
        setInventory((current) => mergeInventory(next, current));
        setInventoryStatus("ready");
      },
      () => active && setInventoryStatus("error"),
    );
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
      setOverview((current) =>
        current
          ? {
              ...current,
              dailyState: "claimed",
              readyCount: current.readyCount + 1,
              earnedTotal: current.earnedTotal + 1,
              unopened: [...current.unopened, box],
            }
          : current,
      );
      setRetry(null);
    } catch {
      setActionError(true);
      setRetry(() => () => void claimDaily());
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
      setOverview((current) =>
        current
          ? {
              ...current,
              readyCount: Math.max(0, current.readyCount - 1),
              openedTotal: current.openedTotal + 1,
              unopened: current.unopened.filter(({ id }) => id !== box.id),
              recent: unlocked ? [unlocked, ...current.recent] : current.recent,
            }
          : current,
      );
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

  if (overviewStatus === "loading") {
    return <div className="prize-state">{copy.prizes.loading}</div>;
  }
  if (overviewStatus === "error" || !overview) {
    return (
      <div className="prize-state" role="alert">
        <p>{copy.prizes.loadFailed}</p>
        <button
          className="button button--lime"
          onClick={() => void loadOverview()}
        >
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
        <div className="prize-header__copy">
          <p className="eyebrow eyebrow--lime">{copy.prizes.eyebrow}</p>
          <h1>{copy.prizes.title}</h1>
          <p>{copy.prizes.intro}</p>
        </div>
        <div className="prize-header__art">
          <Image
            src="/workouts/zoomi-did-it.png"
            alt={copy.prizes.headerArtAlt}
            width={174}
            height={174}
            priority
            unoptimized
          />
          <PrizeBoxVisual small />
        </div>
        <button
          type="button"
          className="prize-help"
          aria-label={copy.prizes.help}
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
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
            <dd>{inventoryStatus === "ready" ? inventory.length : "—"}</dd>
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

      <DailyBox
        overview={overview}
        busy={busy}
        onClaim={() => void claimDaily()}
      />
      <UnopenedBoxes
        boxes={overview.unopened}
        busy={busy}
        onOpen={(box) => void openBox(box)}
      />
      <PrizeCollection
        inventory={inventory}
        status={inventoryStatus}
        onRetry={() => void loadInventory()}
        onMarkViewed={(itemId) => gateway.markViewed(itemId)}
      />

      {reveal ? (
        <PrizeReveal reveal={reveal} onClose={() => setReveal(null)} />
      ) : null}
      {helpOpen ? <PrizeHelp onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}

function DailyBox({
  busy,
  onClaim,
  overview,
}: {
  busy: boolean;
  onClaim(): void;
  overview: PrizeBoxOverview;
}) {
  return (
    <section className="card prize-daily" aria-labelledby="daily-prize-title">
      <PrizeBoxVisual />
      <div>
        <p className="eyebrow">{copy.prizes.dailyEyebrow}</p>
        <h2 id="daily-prize-title">{dailyTitle(overview.dailyState)}</h2>
        <p>{dailyDetail(overview.dailyState)}</p>
        {overview.dailyState === "available" ? (
          <button
            className="button button--lime"
            disabled={busy}
            onClick={onClaim}
          >
            {busy ? copy.prizes.claiming : copy.prizes.claim}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function UnopenedBoxes({
  boxes,
  busy,
  onOpen,
}: {
  boxes: PrizeBox[];
  busy: boolean;
  onOpen(box: PrizeBox): void;
}) {
  const groups = groupBoxes(boxes);
  return (
    <section
      className="prize-section prize-unopened"
      aria-labelledby="ready-boxes-title"
    >
      <div className="prize-section-heading">
        <h2 id="ready-boxes-title">{copy.prizes.yourBoxes}</h2>
        {boxes.length ? <span>{copy.prizes.waiting(boxes.length)}</span> : null}
      </div>
      {groups.length ? (
        <div className="prize-unopened__rail">
          {groups.map(({ boxes: grouped, source }) => (
            <button
              type="button"
              className="prize-box-stack"
              key={source}
              disabled={busy}
              aria-label={copy.prizes.openGroup(
                sourceLabel(source),
                grouped.length,
              )}
              onClick={() => onOpen(grouped[0])}
            >
              <span className="prize-box-stack__visual">
                <PrizeBoxVisual small />
                <b>{grouped.length}</b>
              </span>
              <strong>{sourceLabel(source)}</strong>
              <small>
                {busy
                  ? copy.prizes.opening
                  : copy.prizes.toOpen(grouped.length)}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="prize-empty">{copy.prizes.noBoxes}</p>
      )}
    </section>
  );
}

function PrizeBoxVisual({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`prize-box-art${small ? " prize-box-art--small" : ""}`}
      aria-hidden="true"
    >
      <span>✦</span>
    </span>
  );
}

function PrizeHelp({ onClose }: { onClose(): void }) {
  return (
    <PrizeDialog labelledBy="prize-help-title" onClose={onClose}>
      <div className="prize-dialog__heading">
        <h2 id="prize-help-title">{copy.prizes.help}</h2>
        <button
          type="button"
          aria-label={copy.prizes.closeHelp}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <ol className="prize-help-list">
        {copy.prizes.helpItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </PrizeDialog>
  );
}

function PrizeReveal({
  reveal,
  onClose,
}: {
  reveal: PrizeBoxClaim;
  onClose(): void;
}) {
  return (
    <PrizeDialog
      labelledBy="prize-reveal-title"
      restoreFocusTo="collection-title"
      onClose={onClose}
    >
      {reveal.item ? <PrizeItemArt item={reveal.item} featured /> : null}
      <p className="eyebrow eyebrow--lime">{copy.prizes.revealEyebrow}</p>
      <h2 id="prize-reveal-title">
        {reveal.item?.label ?? copy.prizes.collectionComplete}
      </h2>
      {reveal.item ? (
        <>
          <PrizeRarityBadge rarity={reveal.item.rarity} />
          <Link
            className="button button--lime"
            href={destinationHref(reveal.item)}
          >
            {destinationLabel(reveal.item)}
          </Link>
        </>
      ) : null}
      <button className="text-button" type="button" onClick={onClose}>
        {copy.prizes.close}
      </button>
    </PrizeDialog>
  );
}

function groupBoxes(boxes: PrizeBox[]) {
  const order: PrizeBox["source"][] = [
    "daily_check_in",
    "plan_participation_3",
    "plan_completion_7",
  ];
  return order
    .map((source) => ({
      source,
      boxes: boxes.filter((box) => box.source === source),
    }))
    .filter(({ boxes: grouped }) => grouped.length > 0);
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

function destinationHref(item: PrizeItem) {
  return item.destination === "avatar"
    ? routes.playerAvatar
    : routes.playerTeam;
}

function destinationLabel(item: PrizeItem) {
  return item.destination === "avatar"
    ? copy.prizes.useInAvatar
    : copy.prizes.useInLounge;
}

function mergeInventory(server: PrizeUnlock[], current: PrizeUnlock[]) {
  const serverItems = new Set(server.map(({ item }) => item.id));
  return [
    ...server,
    ...current.filter(({ item }) => !serverItems.has(item.id)),
  ];
}
