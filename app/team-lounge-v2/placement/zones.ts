export interface LoungeStampZone {
  id: string;
  label: string;
  position: Readonly<{ x: number; y: number }>;
}

// These authored points deliberately mirror the server allowlist.
export const loungeStampZones: readonly LoungeStampZone[] = [
  { id: "sand-left", label: "Sand left", position: { x: 37, y: 41 } },
  { id: "sand-center", label: "Sand center", position: { x: 45, y: 60 } },
  { id: "shore-right", label: "Shore right", position: { x: 72, y: 70 } },
  {
    id: "boardwalk-upper",
    label: "Upper boardwalk",
    position: { x: 22, y: 75 },
  },
  {
    id: "boardwalk-lower",
    label: "Lower boardwalk",
    position: { x: 42, y: 119 },
  },
  { id: "sand-lower", label: "Lower sand", position: { x: 67, y: 126 } },
] as const;
