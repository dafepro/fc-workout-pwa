"use client";

import { useState } from "react";
import { createPrizeBoxGateway } from "../data/prize-box-gateway";
import { useAuth } from "../state/auth-context";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

export default function PrizeBoxesPage() {
  const { connected } = useAuth();
  const [gateway] = useState(() => createPrizeBoxGateway(connected));

  return (
    <div className="page prize-page">
      <PrizeBoxesExperience gateway={gateway} />
    </div>
  );
}
