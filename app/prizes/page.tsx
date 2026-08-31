"use client";

import { useState } from "react";
import { useAuth } from "../state/auth-context";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

export default function PrizeBoxesPage() {
  const { runtime } = useAuth();
  const [gateway] = useState(() => runtime.prizeBoxes);

  return (
    <div className="page prize-page">
      <PrizeBoxesExperience gateway={gateway} />
    </div>
  );
}
