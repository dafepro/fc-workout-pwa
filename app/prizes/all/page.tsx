"use client";

import { useOptionalTraining } from "../../state/training-context";
import { PrizeCollection } from "../PrizeCollection";

export default function AllPrizesPage() {
  const training = useOptionalTraining();
  return (
    <div className="player-page prize-boxes-page">
      <PrizeCollection connected={training?.connected ?? false} />
    </div>
  );
}
