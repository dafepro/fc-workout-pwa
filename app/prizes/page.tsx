"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { collectionFilter } from "./navigation";
import { useAuth } from "../state/auth-context";
import { PrizeBoxesExperience } from "./PrizeBoxesExperience";

export default function PrizeBoxesPage() {
  const { runtime } = useAuth();
  const [gateway] = useState(() => runtime.prizeBoxes);
  const search = useSearchParams();

  return (
    <div className="page prize-page">
      <PrizeBoxesExperience
        gateway={gateway}
        initialFilter={collectionFilter(search.get("filter"))}
      />
    </div>
  );
}
