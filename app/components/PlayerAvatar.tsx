"use client";

import type { ComponentProps } from "react";
import { useAvatarIdentity } from "../state/avatar-identity-context";
import { Avatar } from "./Avatar";

type PlayerAvatarProps = Omit<
  ComponentProps<typeof Avatar>,
  "config" | "isCurrentPlayer"
> & {
  emphasizeSelf?: boolean;
};

export function PlayerAvatar({
  player,
  emphasizeSelf = true,
  ...props
}: PlayerAvatarProps) {
  const { currentPlayerID, avatarConfig } = useAvatarIdentity();
  const isCurrentPlayer = player.id === currentPlayerID;

  return (
    <Avatar
      {...props}
      player={player}
      config={isCurrentPlayer ? avatarConfig : undefined}
      isCurrentPlayer={isCurrentPlayer && emphasizeSelf}
    />
  );
}
