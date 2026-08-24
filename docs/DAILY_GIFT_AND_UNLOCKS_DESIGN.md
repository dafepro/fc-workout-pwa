# Daily Drop and Unlocks Design

Status: backend foundation in progress

## Implementation status

The first backend slice now provides the versioned award catalog, a durable unlock ledger, once-per-day claims, hashed idempotency keys, non-duplicate selection, collection-complete results, logical-backup coverage, and authenticated status/claim/inventory endpoints. It uses the deployment’s configured team timezone until the multi-team timezone decision is resolved.

Player UI, viewed/new acknowledgement, inventory-aware avatar validation, and the Team Canvas unlock adapter remain to be implemented.

## Product intent

Give a player one small, free reason to check in each day without requiring or encouraging another workout. The player opens a branded **Daily Drop** and receives either an avatar part or a Team Canvas stamp.

“Lootbox” is an implementation shorthand only. Player-facing copy must use “Daily Drop” or “daily gift.” This feature has no purchase, paid reroll, trade, cash value, odds display, or streak multiplier.

## Player flow

1. The authenticated Today view asks for Daily Drop status.
2. If today is available, a compact sealed-drop card appears below the primary next action. It never blocks logging or navigation.
3. The player chooses **Open today’s drop**. That single POST both records the daily claim and returns the awarded item.
4. A short, reduced-motion-safe reveal shows the item, its collection, and one relevant action: **Try it on** or **Use in Team lounge**.
5. After dismissal, the card becomes a quiet “Collected today” state. The new item has a badge in its destination picker until viewed.

Opening the app or claiming a drop does not increase Momentum. Momentum continues to represent fitness participation through an approved activity or planned rest.

## Award rules

- One successful claim per player per applicable calendar day.
- The server chooses only from enabled catalog items the player does not own.
- While any eligible locked item remains, the player receives no duplicate.
- Avatar items and Canvas stamps use a configurable pool weight, initially 50/50 when both pools have eligible items.
- If one pool is exhausted, choose from the other.
- If the whole collection is complete, return a predefined celebration result with no currency and no synthetic duplicate.
- A failed response never consumes the claim. Retrying the same idempotency key returns the same result.

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
};

type PlayerUnlock = {
  playerId: string;
  itemId: string;
  source: "included" | "daily_drop" | "staff_grant";
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
- unique `(player_id, claim_day)`

### `player_unlocks`

- `player_id`
- `item_kind`
- `item_id`
- `source`
- `unlocked_at`
- `viewed_at` nullable
- primary key `(player_id, item_kind, item_id)`

The claim and unlock insert occur in one transaction. The unique day constraint is the final concurrency guard. A conflict reloads and returns the existing claim.

## API

`GET /v1/player/daily-drop`

Returns `available`, `claimed`, or `collection_complete`, plus today’s existing result when claimed.

`POST /v1/player/daily-drop/claim`

Requires the player session and `Idempotency-Key`. It accepts no item choice. The response includes the awarded item’s safe catalog projection and destination action.

`GET /v1/player/unlocks?kind=avatar_part|canvas_stamp`

Returns enabled item IDs with `unlocked` and `new` state. It does not expose rarity or other players’ inventories.

`POST /v1/player/unlocks/{itemId}/viewed`

Idempotently clears the local “new” badge after server authorization and catalog validation.

## Avatar integration

The next avatar configuration version separates `head`, `eyes`, `mouth`, and `facialHair`. Configuration validation must reject a locked item even if a client submits its ID directly. Older configurations normalize into the new layer defaults; the previous combined head art remains available only as a migration source, not as a second rendering path.

Main categories have three included choices. Optional categories have `none` plus two included choices. Daily Drop items extend those trays without changing their basic option counts.

## Canvas integration

The stamp tray receives unlocked IDs from `StampUnlockPort`. Unknown or disabled IDs are ignored safely. Removing a catalog item never corrupts an existing board: the app preserves its stored ID and the adapter supplies a neutral fallback rendering until the board is edited.

## Failure and abuse handling

- Require the same authenticated player/session controls as other player routes.
- Rate-limit status and claim endpoints separately.
- Never accept player-authored labels, images, or item metadata.
- Log claim outcome and catalog/item ID without unnecessary session data.
- Count claims and failures in metrics, but do not publish comparative claim counts to players.
- Staff grants are an audited future operator action, not part of the first player UI.

## Accessibility and motion

- The sealed card is an ordinary button, not a mystery gesture.
- The reveal announces “Unlocked: {item label}” in a polite live region.
- Confetti is decorative, lasts under one second, and is removed under `prefers-reduced-motion`.
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
