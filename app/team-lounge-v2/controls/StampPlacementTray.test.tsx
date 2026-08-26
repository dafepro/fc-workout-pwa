import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StampPlacementTray } from "./StampPlacementTray";

const target = {
  id: "target",
  kind: "emoji" as const,
  glyph: "🎯",
  label: "Target",
};

describe("StampPlacementTray", () => {
  it("keeps stamp choices unavailable until a check-in earns a credit", () => {
    render(
      <StampPlacementTray
        choices={[target]}
        selected={null}
        summary={{ earned: 0, used: 0, remaining: 0 }}
        status="exhausted"
        error={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Check in to earn a placement")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Choose Target stamp" }),
    ).toBeNull();
  });

  it("explains the day lock after all earned placements are used", () => {
    render(
      <StampPlacementTray
        choices={[target]}
        selected={null}
        summary={{ earned: 2, used: 2, remaining: 0 }}
        status="exhausted"
        error={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("All weekly placements used")).toBeVisible();
    expect(
      screen.getByText(
        "Earlier stamps are locked. Today’s stamps can still be adjusted.",
      ),
    ).toBeVisible();
  });

  it("shows a recoverable message when the owned stamp catalog fails", () => {
    render(
      <StampPlacementTray
        choices={[]}
        selected={null}
        summary={null}
        status="error"
        error={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your stamps could not load. Close Stamps and try again.",
    );
  });
});
