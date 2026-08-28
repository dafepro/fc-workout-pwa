import type { LoungeItemChoice } from "./lounge-items";

export type { LoungeItemChoice } from "./lounge-items";

export const loungeDevelopment = {
  enabled: false,
  itemDefinitions: [],
  initialChoices: [] as LoungeItemChoice[],
  itemChoices: (): LoungeItemChoice[] => [],
  itemForDefinition: (): LoungeItemChoice | undefined => undefined,
} as const;
