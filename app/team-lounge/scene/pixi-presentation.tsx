import type {
  AssetManifest,
  EntityVisualProjector,
} from "@canvas-physics/client";
import type { ItemDefinition } from "@canvas-physics/core";
import { loungeItemForDefinition } from "../lounge-items";

interface LoungePixiPresentation {
  assets: AssetManifest;
  definitions: ItemDefinition[];
  projectEntityVisual: EntityVisualProjector;
}

export function createLoungePixiPresentation({
  assets,
  definitions,
}: {
  assets: AssetManifest;
  definitions: readonly ItemDefinition[];
}): LoungePixiPresentation {
  const sources = [...assets.sources];
  const textures = [...assets.textures];

  const presentedDefinitions = definitions.map((definition) => {
    const item = loungeItemForDefinition(definition.definitionId);
    if (!item) return definition;
    return {
      ...definition,
      visual: {
        ...definition.visual,
        spriteId: "lounge.stamp.transparent",
      },
    };
  });

  return {
    assets: {
      ...assets,
      id: `${assets.id}-pixi-presentation`,
      revision: `${assets.revision}-pixi-v1`,
      sources,
      textures,
    },
    definitions: presentedDefinitions,
    projectEntityVisual() {
      return undefined;
    },
  };
}
