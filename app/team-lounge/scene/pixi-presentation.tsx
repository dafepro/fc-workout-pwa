import type {
  AssetManifest,
  EntityVisualProjector,
} from "@canvas-physics/client";
import type { ItemDefinition } from "@canvas-physics/core";
import { renderToStaticMarkup } from "react-dom/server";

import { AvatarArt } from "../../avatar/AvatarArt";
import { playerColor } from "../../avatar/color";
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
    src: svgDataURI(<InitialsAvatar initials="?" color="#1d5a87" />),
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
    const initials =
      `${player.firstName[0] ?? ""}${player.lastInitial[0] ?? ""}`.toUpperCase();
    sources.push({
      id: sourceId,
      src: svgDataURI(
        player.id === currentPlayerID ? (
          <CurrentPlayerAvatar config={avatarConfig} />
        ) : (
          <InitialsAvatar initials={initials} color={playerColor(player.id)} />
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

    const sourceId = `lounge-item-source-${definition.definitionId}`;
    const textureId = `lounge.item.${definition.definitionId}`;
    sources.push({
      id: sourceId,
      src: item.imageSrc ?? svgDataURI(<StampGlyph glyph={item.glyph} />),
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
        <AvatarArt config={config} />
      </svg>
    </svg>
  );
}

function InitialsAvatar({
  initials,
  color,
}: {
  initials: string;
  color: string;
}) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72">
      <circle cx="32" cy="32" r="35" fill="white" />
      <circle cx="32" cy="32" r="31.5" fill={color} />
      <text
        x="32"
        y="34"
        fill="#092a2d"
        fontFamily="Arial, sans-serif"
        fontSize="23"
        fontWeight="900"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {initials}
      </text>
    </svg>
  );
}

function StampGlyph({ glyph }: { glyph: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <text
        x="48"
        y="52"
        fill="white"
        stroke="white"
        strokeWidth="7"
        paintOrder="stroke"
        fontFamily="Apple Color Emoji, Segoe UI Emoji, sans-serif"
        fontSize="58"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {glyph}
      </text>
    </svg>
  );
}

function svgDataURI(node: React.ReactNode): string {
  return `data:image/svg+xml,${encodeURIComponent(renderToStaticMarkup(node))}`;
}
