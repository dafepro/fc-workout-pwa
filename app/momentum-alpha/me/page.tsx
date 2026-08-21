"use client";

import { useAuth } from "../../state/auth-context";
import { MomentumMe } from "../components/MomentumMe";

export default function MomentumAlphaMePage() {
  const { currentPlayer, session } = useAuth();

  return (
    <MomentumMe
      player={{
        firstName: currentPlayer.firstName,
        lastInitial: currentPlayer.lastInitial,
        team: session?.player?.teams[0]?.name ?? "Hill Striders",
        initials: currentPlayer.initials,
      }}
      showReviewControls={process.env.NODE_ENV !== "production"}
    />
  );
}
