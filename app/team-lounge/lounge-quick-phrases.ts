export interface LoungeQuickPhrase {
  id: string;
  text: string;
}

interface LoungeChatPackDefinition {
  id: string;
  label: string;
  description: string;
  phrases: readonly LoungeQuickPhrase[];
}

export const MAX_ACTIVE_LOUNGE_CHAT_PACKS = 3;

export const loungeChatPacks = [
  {
    id: "standard",
    label: "Standard",
    description: "Everyday hellos, thanks, and team energy.",
    phrases: [
      { id: "hi", text: "Hi!" },
      { id: "bye", text: "Bye!" },
      { id: "lets-go", text: "Let's Go!" },
      { id: "nice", text: "Nice!" },
      { id: "ok", text: "OK" },
      { id: "oops", text: "Oops" },
      { id: "no", text: "No" },
      { id: "yep", text: "Yep" },
      { id: "huh", text: "Huh?" },
      { id: "thanks-bromigo", text: "Thanks Bromigo" },
    ],
  },
  {
    id: "pirate-1",
    label: "Pirate 1",
    description: "Shipshape shouts for a very good crew.",
    phrases: [
      { id: "pirate-ahoy", text: "Ahoy!" },
      { id: "pirate-aye-aye", text: "Aye aye!" },
      { id: "pirate-arrr", text: "Arrr!" },
      { id: "pirate-full-speed", text: "Full speed!" },
      { id: "pirate-good-crew", text: "Good crew!" },
      { id: "pirate-raise-flag", text: "Raise the flag!" },
      { id: "pirate-treasure", text: "Treasure spotted!" },
      { id: "pirate-shipshape", text: "Shipshape!" },
      { id: "pirate-cleats", text: "Shiver me cleats!" },
      { id: "pirate-crew-goals", text: "Crew goals!" },
    ],
  },
  {
    id: "gen-alpha",
    label: "Gen Alpha",
    description: "Current slang, safely locked to positive vibes.",
    phrases: [
      { id: "alpha-w", text: "W" },
      { id: "alpha-big-w", text: "Big W" },
      { id: "alpha-locked-in", text: "Locked in" },
      { id: "alpha-let-cook", text: "Let them cook" },
      { id: "alpha-aura", text: "Aura +100" },
      { id: "alpha-no-cap", text: "No cap" },
      { id: "alpha-fire", text: "That's fire" },
      { id: "alpha-goated", text: "Goated" },
      { id: "alpha-say-less", text: "Say less" },
      { id: "alpha-side-quest", text: "Side quest!" },
    ],
  },
  {
    id: "space-cadet",
    label: "Space Cadet",
    description: "Mission-control messages from way out there.",
    phrases: [
      { id: "space-earthling", text: "Hi, Earthling!" },
      { id: "space-blast-off", text: "Blast off!" },
      { id: "space-cosmic", text: "Cosmic!" },
      { id: "space-orbit", text: "Orbit mode" },
      { id: "space-mission-go", text: "Mission go!" },
      { id: "space-meteor", text: "Meteor move!" },
      { id: "space-moon-bounce", text: "Moon bounce!" },
      { id: "space-star-power", text: "Star power!" },
      { id: "space-approved", text: "Alien approved!" },
      { id: "space-beam-in", text: "Beam me in!" },
    ],
  },
  {
    id: "sideline",
    label: "Sideline",
    description: "Short soccer calls for playing together.",
    phrases: [
      { id: "side-great-pass", text: "Great pass!" },
      { id: "side-nice-move", text: "Nice move!" },
      { id: "side-im-open", text: "I'm open!" },
      { id: "side-your-ball", text: "Your ball!" },
      { id: "side-one-more", text: "One more!" },
      { id: "side-team-up", text: "Team up!" },
      { id: "side-goal-time", text: "Goal time!" },
      { id: "side-defense", text: "Defense mode!" },
      { id: "side-reset", text: "Reset!" },
      { id: "side-hustle", text: "Good hustle!" },
    ],
  },
  {
    id: "snack-attack",
    label: "Snack Attack",
    description: "Extremely serious messages about snacks.",
    phrases: [
      { id: "snack-attack", text: "Snack attack!" },
      { id: "snack-pickle", text: "Pickle power!" },
      { id: "snack-nacho", text: "Nacho average move!" },
      { id: "snack-waffle", text: "Waffle mode!" },
      { id: "snack-banana", text: "Banana boost!" },
      { id: "snack-juice", text: "Juice break!" },
      { id: "snack-pretzel", text: "Pretzel logic!" },
      { id: "snack-cheese", text: "Cheese speed!" },
      { id: "snack-taco", text: "Taco 'bout teamwork!" },
      { id: "snack-cookie", text: "Cookie cooldown!" },
    ],
  },
] as const satisfies readonly LoungeChatPackDefinition[];

export type LoungeChatPack = (typeof loungeChatPacks)[number];
export type LoungeChatPackID = LoungeChatPack["id"];

export const defaultLoungeChatPackIDs: readonly LoungeChatPackID[] = [
  "standard",
  "pirate-1",
  "gen-alpha",
];

export const loungeQuickPhrases: readonly LoungeQuickPhrase[] =
  loungeChatPacks.flatMap<LoungeQuickPhrase>(
    ({ phrases }): readonly LoungeQuickPhrase[] => phrases,
  );

const loungeChatPackIDSet = new Set<string>(
  loungeChatPacks.map(({ id }) => id),
);

export function normalizeLoungeChatPackIDs(value: unknown): LoungeChatPackID[] {
  if (!Array.isArray(value)) return [...defaultLoungeChatPackIDs];
  const normalized: LoungeChatPackID[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "string" ||
      !loungeChatPackIDSet.has(candidate) ||
      normalized.includes(candidate as LoungeChatPackID)
    ) {
      continue;
    }
    normalized.push(candidate as LoungeChatPackID);
    if (normalized.length === MAX_ACTIVE_LOUNGE_CHAT_PACKS) break;
  }
  return normalized.length > 0 ? normalized : [...defaultLoungeChatPackIDs];
}

export function toggleLoungeChatPack(
  active: readonly LoungeChatPackID[],
  packID: LoungeChatPackID,
): LoungeChatPackID[] {
  if (active.includes(packID)) {
    return active.length === 1
      ? [...active]
      : active.filter((candidate) => candidate !== packID);
  }
  return active.length >= MAX_ACTIVE_LOUNGE_CHAT_PACKS
    ? [...active]
    : [...active, packID];
}
