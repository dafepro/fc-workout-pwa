import type { LoungeTheme } from "./data/lounge-gateway";

export const defaultLoungeTheme: LoungeTheme = {
  id: "beach-boardwalk",
  version: 1,
  name: "Beach Boardwalk",
};

export const teamLoungeV2Copy = {
  label: "Team Lounge",
  regionLabel: (themeName: string) => `${themeName} Team Lounge`,
  preview: "V2 · Local Canvas preview",
  shared: "V2 · Shared Canvas room",
  loading: "Setting up the boardwalk…",
  ready: "Press your player, then drag to move.",
  reconnecting: "Rejoining the team…",
  unavailable: "The boardwalk could not open.",
  retry: "Try again",
  emotes: "Emotes",
  stamps: "Stamps",
  closeStamps: "Close stamps",
  editableStampBadge: "Edit",
  items: "Items",
  map: "Map",
  mapHint: "This room fits on one screen.",
  itemsHint: "Props arrive in a later V2 slice.",
  localHint: "Local physics preview · teammates and persistence come next",
  sharedHint: "Live team room · the boardwalk ball persists between visits",
  placementTray: {
    loading: "Loading your stamps…",
    error: "Your stamps could not load. Close Stamps and try again.",
    sharedOnly: "Join the shared team room to leave a weekly stamp.",
    ready: (count: number) =>
      `${count} ${count === 1 ? "placement" : "placements"} ready`,
    earn: "Check in to earn a placement",
    used: "All weekly placements used",
    placing: "Adding your stamp…",
    place: "Tap anywhere in the lounge to place it.",
    locked: "Earlier stamps are locked. Today’s stamps can still be adjusted.",
    explanation: "Each workout or rest check-in adds one for this week.",
    empty: "No stamps are available to place yet.",
  },
  placementError: "That stamp could not be placed. Pick a spot and try again.",
  placementErrors: {
    stamp_unavailable:
      "That stamp is no longer in your collection. Choose another.",
    stamp_inventory_unavailable:
      "Your stamp collection could not refresh. Close Stamps and try again.",
    stamp_invalid_placement: "Tap inside the lounge, away from the very edge.",
    stamp_invalid_scale: "Keep your stamp between the small and large limits.",
    stamp_invalid_rotation: "Rotate your stamp in 15 degree steps.",
    stamp_budget_exhausted: "You’ve used this week’s placement credits.",
    stamp_locked: "This stamp was set on an earlier day and is now locked.",
    stamp_editing_unavailable:
      "Only your own stamps placed today can be changed.",
    application_denied: "That stamp could not be placed right now.",
  } as Record<string, string>,
} as const;
