/// <reference types="vite/client" />

declare const __ZOOMIGO_DEVELOPMENT_BUILD__: boolean;

declare module "#lounge-development" {
  import type { ItemDefinition } from "@canvas-physics/core";
  import type { PrizeUnlock } from "./data/prize-box-gateway";

  export interface LoungeItemChoice {
    id: string;
    label: string;
    glyph: string;
    definitionId: string;
    source: "included" | "earned";
    kind: "lounge_stamp" | "lounge_prop";
  }

  export const loungeDevelopment: {
    readonly enabled: boolean;
    readonly itemDefinitions: readonly ItemDefinition[];
    readonly initialChoices: LoungeItemChoice[];
    itemChoices(inventory: readonly PrizeUnlock[]): LoungeItemChoice[];
    itemForDefinition(definitionId: string): LoungeItemChoice | undefined;
  };
}
