"use client";

import { useOptionalTraining } from "../state/training-context";
import { DailyDropCard } from "../player/components/DailyDropCard";

export default function PrizeBoxesPage() {
  const training = useOptionalTraining();
  return (
    <div className="player-page prize-boxes-page">
      <header>
        <p className="player-eyebrow">Rewards</p>
        <h1>Prize boxes</h1>
        <p>Available, earned, and opened items live here.</p>
      </header>
      <DailyDropCard connected={training?.connected ?? false} />
      {!training?.connected ? (
        <p className="prize-boxes-page__empty">
          Prize boxes appear here when rewards are connected.
        </p>
      ) : null}
    </div>
  );
}
