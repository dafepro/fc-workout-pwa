import type { Metadata } from "next";
import { MomentumConcept } from "./MomentumConcept";
import "./momentum.css";

export const metadata: Metadata = {
  title: "Momentum concept",
  description: "A review draft and interactive prototype for ZoomiGo Momentum.",
};

export default function MomentumConceptPage() {
  return <MomentumConcept />;
}
