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
    if (item.kind === "lounge_stamp") return definition;
    if (!item.imageSrc) return definition;

    const sourceId = `lounge-item-source-${definition.definitionId}`;
    const textureId = `lounge.item.${definition.definitionId}`;
    sources.push({
      id: sourceId,
      src: item.imageSrc,
      required: true,
    });
    textures.push({ id: textureId, sourceId });
    return {
      ...definition,
      visual: { ...definition.visual, spriteId: textureId },
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
