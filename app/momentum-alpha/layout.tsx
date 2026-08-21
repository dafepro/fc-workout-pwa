import type { Metadata } from "next";
import { MomentumAlphaShell } from "./components/MomentumAlphaShell";
import { MomentumAlphaProvider } from "./state";
import "./momentum-alpha.css";

export const metadata: Metadata = {
  title: "Momentum Alpha",
  description: "A simplified alternate ZoomiGo player experience.",
};

export default function MomentumAlphaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MomentumAlphaProvider>
      <MomentumAlphaShell>{children}</MomentumAlphaShell>
    </MomentumAlphaProvider>
  );
}
