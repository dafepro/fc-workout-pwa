import type {
  AssetManifest,
  EntityVisualProjector,
} from "@canvas-physics/client";
import type { ItemDefinition } from "@canvas-physics/core";
import { renderToStaticMarkup } from "react-dom/server";

import { AvatarArt } from "../../avatar/AvatarArt";
import { normalizeAvatar } from "../../avatar/config";
import type { AvatarConfiguration } from "../../avatar/types";
import type { Player } from "../../domain/types";
import { loungeItemForDefinition } from "../lounge-items";

interface LoungePixiPresentation {
  assets: AssetManifest;
  definitions: ItemDefinition[];
  projectEntityVisual: EntityVisualProjector;
}

export function createLoungePixiPresentation({
  assets,
  definitions,
  roster,
  currentPlayerID,
  avatarConfig,
}: {
  assets: AssetManifest;
  definitions: readonly ItemDefinition[];
  roster: readonly Player[];
  currentPlayerID: string;
  avatarConfig: AvatarConfiguration;
}): LoungePixiPresentation {
  const sources = [...assets.sources];
  const textures = [...assets.textures];
  const avatarVariants: NonNullable<ItemDefinition["visual"]["variants"]> = {};
  const participantVariants = new Map<string, string>();

  sources.push({
    id: "lounge-avatar-source-unknown",
    src: svgDataURI(<CurrentPlayerAvatar config={normalizeAvatar({})} />),
    required: true,
  });
  textures.push({
    id: "lounge.avatar.unknown",
    sourceId: "lounge-avatar-source-unknown",
  });

  roster.forEach((player, index) => {
    const variant = `participant-${index}`;
    const sourceId = `lounge-avatar-source-${index}`;
    const textureId = `lounge.avatar.${variant}`;
    sources.push({
      id: sourceId,
      src: svgDataURI(
        player.id === currentPlayerID ? (
          <CurrentPlayerAvatar config={avatarConfig} />
        ) : (
          <CurrentPlayerAvatar
            config={normalizeAvatar(player.avatarConfiguration ?? {})}
          />
        ),
      ),
      required: true,
    });
    textures.push({ id: textureId, sourceId });
    avatarVariants[variant] = { spriteId: textureId };
    participantVariants.set(player.id, variant);
  });

  const presentedDefinitions = definitions.map((definition) => {
    if (definition.definitionId === "avatar") {
      return {
        ...definition,
        visual: {
          ...definition.visual,
          spriteId: "lounge.avatar.unknown",
          variants: avatarVariants,
        },
      };
    }
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
    projectEntityVisual(entity) {
      if (entity.kind !== "avatar" || !entity.userId) return undefined;
      const variant = participantVariants.get(entity.userId);
      return variant ? { variant } : undefined;
    },
  };
}

function CurrentPlayerAvatar({ config }: { config: AvatarConfiguration }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72">
      <circle cx="32" cy="32" r="35" fill="white" />
      <circle cx="32" cy="32" r="32.5" fill="#c8f52a" />
      <svg x="2" y="2" width="60" height="60" viewBox="0 0 64 64">
        <AvatarArt
          config={config}
          layerKinds={["background", "kit", "head", "hat", "eyewear"]}
        />
      </svg>
    </svg>
  );
}

function svgDataURI(node: React.ReactNode): string {
  return `data:image/svg+xml,${encodeURIComponent(renderToStaticMarkup(node))}`;
}
