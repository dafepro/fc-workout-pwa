import type { AvatarOption } from "../types";

export function renderBackground(option: AvatarOption) {
  return (
    <>
      <rect x="0" y="0" width="64" height="64" fill={option.color} />
      <ellipse cx="20" cy="12" rx="26" ry="16" fill="white" opacity="0.16" />
    </>
  );
}
