"use client";

import { useOptionalTraining } from "../state/training-context";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

export default function PrizeBoxesPage() {
  const training = useOptionalTraining();
  return (
    <div className="player-page prize-boxes-page">
      <PrizeBoxesExperience connected={training?.connected ?? false} />
    </div>
  );
}
