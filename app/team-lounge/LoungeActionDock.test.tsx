import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { loungeEmotes } from "./lounge-emotes";
import { loungeQuickPhrases } from "./lounge-quick-phrases";
import { includedLoungeItems, type LoungeItemChoice } from "./lounge-items";
import { LoungeActionDock } from "./LoungeActionDock";

const earnedProp: LoungeItemChoice = {
  id: "beach-ball",
  label: "Beach ball",
  glyph: "⚽",
  definitionId: "zoomigo-prop-beach-ball",
  definitionVersion: 2,
  source: "earned",
  kind: "lounge_prop",
};

describe("Lounge action dock", () => {
  it("uses the consolidated V2 action bar and categorized item sheet", () => {
    const onSelectItem = vi.fn();
    const onSendEmote = vi.fn();
    const onSendQuickPhrase = vi.fn();
    render(
      <LoungeActionDock
        choices={[...includedLoungeItems, earnedProp]}
        selectedItem={null}
        remaining={2}
        placing={false}
        reactionLocked={false}
        onSelectItem={onSelectItem}
        onSendEmote={onSendEmote}
        onSendQuickPhrase={onSendQuickPhrase}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Lounge actions" }),
    ).toBeVisible();
    expect(
      screen
        .getByRole("navigation", { name: "Lounge actions" })
        .querySelectorAll(":scope > button"),
    ).toHaveLength(4);
    expect(
      Array.from(
        screen
          .getByRole("navigation", { name: "Lounge actions" })
          .querySelectorAll(":scope > button"),
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(["✦Stamps", "▣Items", "▤Quick messages", "☺Emotes"]);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a Lounge item" }),
    ).toBeVisible();
    expect(screen.getByText("2 placements left this week")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose Bolt stamp" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Choose Beach ball item" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Items" }));
    const beachBall = screen.getByRole("button", {
      name: "Choose Beach ball item",
    });
    expect(screen.getByRole("img", { name: "Camp lantern" })).toHaveAttribute(
      "src",
      "/team-lounge/items/camp-lantern-v1.png",
    );
    expect(beachBall).toBeVisible();
    expect(screen.getByText("Earned")).toBeVisible();
    fireEvent.click(beachBall);
    expect(onSelectItem).toHaveBeenCalledWith(earnedProp);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Emotes" }));
    fireEvent.click(screen.getByRole("button", { name: "Send Wave emote" }));
    expect(onSendEmote).toHaveBeenCalledWith(loungeEmotes[0]);

    fireEvent.click(screen.getByRole("button", { name: "Quick messages" }));
    expect(screen.queryByRole("tab", { name: "Quick messages" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Send Nice! quick message" }),
    );
    expect(onSendQuickPhrase).toHaveBeenCalledWith(loungeQuickPhrases[0]);
  });

  it("keeps exhausted placement controls visible but disabled", () => {
    render(
      <LoungeActionDock
        choices={includedLoungeItems}
        selectedItem={null}
        remaining={0}
        placing={false}
        reactionLocked={false}
        onSelectItem={vi.fn()}
        onSendEmote={vi.fn()}
        onSendQuickPhrase={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stamps" }));
    expect(
      screen.getByText("Complete another training day to place another item."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose Bolt stamp" }),
    ).toBeDisabled();
  });
});
