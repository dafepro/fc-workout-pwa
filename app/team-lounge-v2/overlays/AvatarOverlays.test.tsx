import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultAvatar } from "../../avatar/config";
import { AvatarOverlays } from "./AvatarOverlays";

describe("AvatarOverlays", () => {
  it("keeps the signed-in player above overlapping teammate avatars", () => {
    render(
      <AvatarOverlays
        participants={[
          {
            playerID: "ava",
            displayName: "Ava R.",
            accessibleName: "Ava R.",
            avatarConfiguration: defaultAvatar(),
            current: false,
            screen: { x: 100, y: 100 },
          },
          {
            playerID: "mason",
            displayName: "Mason C.",
            accessibleName: "Mason C., you",
            avatarConfiguration: defaultAvatar(),
            current: true,
            screen: { x: 100, y: 100 },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Mason C., you")).toHaveStyle({ zIndex: 2 });
    expect(screen.getByLabelText("Ava R.")).toHaveStyle({ zIndex: 1 });
  });
});
