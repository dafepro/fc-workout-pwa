"use client";

import { createContext, useContext } from "react";
import type { AvatarConfiguration } from "../avatar/types";

interface AvatarIdentity {
  currentPlayerID: string;
  avatarConfig: AvatarConfiguration;
}

const AvatarIdentityContext = createContext<AvatarIdentity | null>(null);

export function AvatarIdentityProvider({
  value,
  children,
}: {
  value: AvatarIdentity;
  children: React.ReactNode;
}) {
  return (
    <AvatarIdentityContext.Provider value={value}>
      {children}
    </AvatarIdentityContext.Provider>
  );
}

export function useAvatarIdentity(): AvatarIdentity {
  const value = useContext(AvatarIdentityContext);
  if (!value) {
    throw new Error(
      "useAvatarIdentity must be used inside AvatarIdentityProvider",
    );
  }
  return value;
}
