# Daily Drop and Unlocks Design

Status: sealed-box pool, reveal, collection/history, and shared destination inventory implemented

## Implementation status

The first backend slice provides the versioned award catalog, a durable unlock
ledger, once-per-day claims, hashed idempotency keys, non-duplicate selection,
collection-complete results, logical-backup coverage, and authenticated
status/claim/inventory endpoints. It uses the deployment’s configured team
timezone until the multi-team timezone decision is resolved.

The connected Prize boxes destination separates earning, claiming, and opening.
Claiming the daily freebie adds a sealed box to a durable server-owned pool and
does not reveal or grant an item. Opening one specific box uses a separate stable
idempotency key, awards the item transactionally, and removes that box from the
pool. Opening does not create a training entry or change Momentum. The local
disconnected prototype does not invent a second collection.

The landing screen is deliberately short: light Zoomi branding, three summary
values, the daily claim, unopened boxes, three recent items, and one route to the
full collection. Collection and history are separate views. Both show actual
avatar/stamp art, restrained text-plus-color rarity, source, and destination.

Avatar Studio now loads earned parts from the shared inventory, keeps reward
parts locked during loading or failure, displays new parts accessibly, and
acknowledges them when their tray is deliberately opened. The backend rejects a
known catalog reward part unless the authenticated player owns it; safe unknown
legacy slugs still round-trip so a rolling catalog deployment cannot erase an
older configuration.

Team Canvas now receives included and earned stamp assets through its narrow
unlock port. Permanent ownership is independent from the existing daily
placement-slot limit, unknown or retired catalog items are ignored, and the
backend rejects placement of a known unowned stamp even from a modified client.

## Product intent

Give a player one small, free reason to check in without requiring or
encouraging another workout. The player opens a branded prize box and receives
either an avatar part or a Team Canvas stamp.

“Lootbox” and “Daily Drop” are implementation shorthand only. The permanent
player destination uses **Prize boxes** so the interface does not promise a
prize every day. This feature has no purchase, paid reroll, trade, cash value,
odds display, or streak multiplier.

## Player flow

1. Today always exposes a compact **View prize boxes** destination row.
2. The authenticated Prize boxes page loads the daily state and unopened pool.
3. **Claim daily box** adds one sealed box to **Your boxes**. It reveals no item.
4. The player may open any waiting box now or later. A second idempotent request
   draws and persists the item in the same transaction that opens the box.
5. A short, reduced-motion-safe reveal shows actual item art, name, rarity, and
   its Avatar or Team Lounge destination.
6. The item joins Collection and chronological History. The new item retains a
   destination badge until deliberately viewed there.

Opening the app or claiming a drop does not increase Momentum. Momentum continues to represent fitness participation through an approved activity or planned rest.

## Award rules

- One successful daily-box claim per player per applicable calendar day.
- Claiming and opening are separate; a claimed box remains durable until opened.
- The server chooses only from enabled catalog items the player does not own.
- While any eligible locked item remains, the player receives no duplicate.
- Avatar items and Canvas stamps use a configurable pool weight, initially 50/50 when both pools have eligible items.
- If one pool is exhausted, choose from the other.
- If the whole collection is complete, return a predefined celebration result with no currency and no synthetic duplicate.
- A failed response never rerolls an opened box. Retrying the same open
  idempotency key returns the same result.

The selection algorithm may be random, but correctness must not depend on secrecy or rarity. A cryptographically secure server source is sufficient. Store the awarded item in the claim transaction so retries never reroll.

## Catalog and inventory boundary

The application owns a versioned catalog. Renderers and plugins receive only stable item IDs and presentation metadata they understand.

```ts
type UnlockItemKind = "avatar_part" | "canvas_stamp";

type UnlockItem = {
  id: string;
  kind: UnlockItemKind;
  catalogVersion: number;
  labelKey: string;
  assetKey: string;
  enabled: boolean;
  basic: boolean;
  rarity: "common" | "uncommon" | "rare" | "epic";
  destination: "avatar" | "team_lounge";
};

type PlayerUnlock = {
  playerId: string;
  itemId: string;
  source:
    | "included"
    | "daily_drop"
    | "staff_grant"
    | "plan_participation_3"
    | "plan_completion_7";
  unlockedAt: string;
  viewedAt?: string;
};
```

Basic avatar options are represented as included unlocks by policy and need not create one row per player. `PlayerUnlock` stores only exceptions and earned items.

The Canvas boundary remains narrow:

```ts
interface StampUnlockPort {
  listUnlockedStampIds(playerId: string): Promise<string[]>;
  markStampViewed(playerId: string, stampId: string): Promise<void>;
}
```

The future Canvas library owns board state, multiplayer synchronization, and physics. It does not decide which stamps a child has earned.

## Backend model

### `daily_drop_claims`

- `id` opaque UUID
- `player_id`
- `claim_day` canonical `YYYY-MM-DD`
- `time_zone` captured IANA zone
- `item_kind`
- `item_id`
- `catalog_version`
- `claimed_at`
- `idempotency_key_hash`
- `opened_at` nullable while sealed
- `open_idempotency_key_hash` nullable until opened
- unique `(player_id, claim_day)`

### `player_unlocks`

- `player_id`
- `item_kind`
- `item_id`
- `source`
- `unlocked_at`
- `viewed_at` nullable
- primary key `(player_id, item_kind, item_id)`

The daily claim inserts only the sealed box. Opening and the unlock insert occur
in one transaction. Unique day and hashed idempotency constraints are final
concurrency guards. A replay reloads the same box or awarded item.

Plan participation boxes use a separate grant ledger keyed by player, plan, and
tier. They share this claim and unlock authority but never consume or replace
the once-per-day check-in claim.

## API

`GET /v1/me/prize-boxes`

Returns daily availability, authoritative unopened boxes, earned/opened totals,
and at most three recently opened items.

`POST /v1/me/prize-boxes/claim-daily`

Requires the player session and `Idempotency-Key`. It creates or replays one
sealed daily box and never returns item or rarity information.

`POST /v1/me/prize-boxes/{boxId}/open`

Requires the player session and a separate `Idempotency-Key`. The server chooses
and persists the item; retries return the same item without rerolling.

The older `/v1/me/daily-drop` routes remain temporarily compatible for older
clients but are not used by the consolidated UI.

`GET /v1/me/unlocks?kind=avatar_part|canvas_stamp`

Returns the authenticated player's enabled items with safe art metadata, rarity,
destination, source, and viewed state. It never exposes another player's inventory.

`POST /v1/me/unlocks/{itemId}/viewed`

Idempotently clears the local “new” badge after server authorization and catalog validation.

## Avatar integration

The next avatar configuration version separates `head`, `eyes`, `mouth`, and `facialHair`. Configuration validation must reject a locked item even if a client submits its ID directly. Older configurations normalize into the new layer defaults; the previous combined head art remains available only as a migration source, not as a second rendering path.

Main categories have three included choices. Optional categories have `none` plus two included choices. Daily Drop items extend those trays without changing their basic option counts.

## Canvas integration

The stamp tray receives unlocked IDs from `StampUnlockPort`. Unknown or disabled IDs are ignored safely. Removing a catalog item never corrupts an existing board: the app preserves its stored ID and the adapter supplies a neutral fallback rendering until the board is edited.

The included first-use stamp set is Bolt, Fire, Star, Soccer Ball, Spark Cleat,
and the ZoomiGo mark. Daily Drops extend this set permanently. Completing a
workout or cooldown may provide a placement slot, but never changes permanent
stamp ownership. Developer playground slots remain an explicit dev-only bypass
and cannot grant inventory.

## Failure and abuse handling

- Require the same authenticated player/session controls as other player routes.
- Rate-limit status and claim endpoints separately.
- Never accept player-authored labels, images, or item metadata.
- Log claim outcome and catalog/item ID without unnecessary session data.
- Count claims and failures in metrics, but do not publish comparative claim counts to players.
- Staff grants are an audited future operator action, not part of the first player UI.

## Accessibility and motion

- The sealed card is an ordinary button, not a mystery gesture.
- The reveal is a labeled dialog and makes the actual reward art its visual focus.
- The only reveal motion is a short item arrival and is removed under
  `prefers-reduced-motion`; there is no confetti dependency.
- Color never carries lock, new, or selected state alone.
- The full flow fits 320 CSS pixels with no horizontal scroll.

## Delivery slices

1. Catalog types, persistence schema, server claim transaction, and domain tests.
2. Today card with sealed, reveal, collected, retry, and collection-complete states.
3. Inventory query and avatar-builder lock/new states.
4. `StampUnlockPort` adapter and Team Canvas stamp tray.
5. Staff/operator catalog controls only if operating needs justify them.

## Open decisions

- Which timezone defines the claim day for a player on multiple teams? Proposed default: the selected team’s captured timezone, with an app-wide uniqueness guard based on the first claim that day.
- Should the 50/50 pool weight be fixed or remotely configurable?
- Should the collection-complete state skip the card entirely after one acknowledgement?
