import {
  loungeItemChoices,
  loungeItemDefinitions,
  loungeItemForDefinition,
} from "./lounge-items";

export type { LoungeItemChoice } from "./lounge-items";

export const loungeDevelopment = {
  enabled: true,
  itemDefinitions: loungeItemDefinitions,
  initialChoices: loungeItemChoices([]),
  itemChoices: loungeItemChoices,
  itemForDefinition: loungeItemForDefinition,
} as const;
