import type { AvatarOption } from "../types";

export function renderBackground(option: AvatarOption) {
  return <rect x="0" y="0" width="64" height="82" fill={option.color} />;
}
