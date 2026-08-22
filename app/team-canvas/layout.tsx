import type { Metadata } from "next";
import { TeamCanvasShell } from "./components/TeamCanvasShell";
import { TeamCanvasProvider } from "./state";

export const metadata: Metadata = {
  title: "Team Canvas Alpha",
  description: "A focused daily training and weekly team canvas experiment.",
};

export default function TeamCanvasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TeamCanvasProvider>
      <TeamCanvasShell>{children}</TeamCanvasShell>
    </TeamCanvasProvider>
  );
}
