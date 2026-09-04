import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { loungeEmotes } from "./lounge-emotes";
import { loungeChatPacks, loungeQuickPhrases } from "./lounge-quick-phrases";
import { includedLoungeItems, type LoungeItemChoice } from "./lounge-items";
import { LoungeActionDock } from "./LoungeActionDock";

const earnedProp: LoungeItemChoice = {
  id: "beach-ball",
  label: "Beach ball",
  glyph: "⚽",
  definitionId: "zoomigo-prop-beach-ball",
  definitionVersion: 3,
  source: "earned",
  kind: "lounge_prop",
  capabilities: ["collision", "physics", "behavior"],
};

describe("Lounge action dock", () => {
  it("keeps reconnecting feedback in the tray and pauses network actions", () => {
    render(
      <LoungeActionDock
        choices={includedLoungeItems}
        selectedItem={null}
        remaining={2}
        capacity={3}
        placing={false}
        reactionLocked={false}
        connectionState="reconnecting"
        onSelectItem={vi.fn()}
        onSendEmote={vi.fn()}
        onSendQuickPhrase={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Canvas connection interrupted. Movement stays local while we reconnect.",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("uses the consolidated V2 action bar and categorized item sheet", async () => {
    const onSelectItem = vi.fn();
    const onSendEmote = vi.fn();
    const onSendQuickPhrase = vi.fn();
    render(
      <LoungeActionDock
        choices={[...includedLoungeItems, earnedProp]}
        selectedItem={null}
        remaining={2}
        capacity={3}
        placing={false}
        reactionLocked={false}
        activePackIDs={["standard", "pirate-1", "gen-alpha"]}
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
    ).toEqual(["✦Stamps2", "▣Items2", "▤Chat", "☺React"]);
    expect(
      screen.getAllByText("2", { selector: ".team-lounge__placement-badge" }),
    ).toHaveLength(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(
      screen.getByRole("button", { name: "Stamps, 2 placements left" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Choose a Lounge item" }),
    ).toBeVisible();
    expect(screen.getByText("2 placements left this week")).toBeVisible();
    expect(screen.getByText("1/3 objects placed this week")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose Bolt stamp" }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Camp lantern" })).toHaveClass(
      "team-lounge__item-art--stamp",
    );
    expect(
      screen.queryByRole("button", { name: "Choose Beach ball item" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Items" }));
    for (const label of [
      "Launch pad",
      "Bounce drum",
      "Pinwheel",
      "Orbit beacon",
      "Breeze fan",
      "Soft sand mat",
      "Ball speed lane",
      "Wobble cone",
      "Swing gate",
      "Mini goal",
    ]) {
      expect(
        screen.getByRole("button", { name: `Choose ${label} item` }),
      ).toBeVisible();
    }
    expect(
      screen
        .getByRole("button", { name: "Choose Wobble cone item" })
        .querySelector(".team-lounge__wobble-cone"),
    ).toHaveClass("team-lounge__item-art--picker");
    const beachBall = screen.getByRole("button", {
      name: "Choose Beach ball item",
    });
    expect(beachBall).toBeVisible();
    expect(screen.getByText("Earned")).toBeVisible();
    fireEvent.click(beachBall);
    expect(onSelectItem).toHaveBeenCalledWith(earnedProp);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "React" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a reaction" }),
    ).toHaveAttribute("data-anchor", "react");
    fireEvent.click(screen.getByRole("button", { name: "Send Wave emote" }));
    expect(onSendEmote).toHaveBeenCalledWith(loungeEmotes[0]);

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    const chatSets = screen.getByRole("dialog", { name: "Choose a chat set" });
    expect(chatSets).toHaveAttribute("data-anchor", "chat");
    expect(chatSets).toHaveAttribute("data-layer", "sets");
    expect(chatSets).toHaveAttribute("data-layout", "compact");
    expect(
      Array.from(
        chatSets.querySelectorAll(".team-lounge__chat-sets > button"),
        (button) => button.textContent,
      ),
    ).toEqual(["Standard", "Pirate 1", "Gen Alpha"]);
    expect(screen.getByRole("button", { name: "Standard" })).toBeEnabled();
    expect(screen.queryByText("10 messages")).toBeNull();
    expect(screen.getByRole("button", { name: "Pirate 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gen Alpha" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Send Nice! quick message" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    const standard = screen.getByRole("dialog", {
      name: "Choose a Standard message",
    });
    expect(standard).toHaveAttribute("data-layer", "standard");
    expect(standard).toHaveAttribute("data-layout", "expanded");
    expect(screen.getByRole("button", { name: "Standard" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(standard.querySelectorAll(".team-lounge__chat-wing")).toHaveLength(
      2,
    );
    expect(
      standard.querySelectorAll(".team-lounge__chat-wing:first-child button"),
    ).toHaveLength(5);
    expect(
      standard.querySelectorAll(".team-lounge__chat-wing:last-child button"),
    ).toHaveLength(5);
    expect(
      screen.getAllByRole("button", { name: / quick message$/u }),
    ).toHaveLength(10);
    fireEvent.click(
      screen.getByRole("button", { name: "Send Hi! quick message" }),
    );
    expect(onSendQuickPhrase).toHaveBeenCalledWith(loungeQuickPhrases[0]);

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Pirate 1" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a Pirate 1 message" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Send Ahoy! quick message" }),
    );
    expect(onSendQuickPhrase).toHaveBeenCalledWith(
      loungeChatPacks[1].phrases[0],
    );
  });

  it("slides an open tray down before removing it", () => {
    vi.useFakeTimers();
    render(
      <LoungeActionDock
        choices={includedLoungeItems}
        selectedItem={null}
        remaining={2}
        capacity={3}
        placing={false}
        reactionLocked={false}
        onSelectItem={vi.fn()}
        onSendEmote={vi.fn()}
        onSendQuickPhrase={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "React" }));
    const tray = screen.getByRole("dialog", { name: "Choose a reaction" });
    expect(tray).toHaveAttribute("data-state", "open");
    fireEvent.click(screen.getByRole("button", { name: "React" }));
    expect(tray).toHaveAttribute("data-state", "closing");
    act(() => vi.advanceTimersByTime(200));
    expect(
      screen.queryByRole("dialog", { name: "Choose a reaction" }),
    ).toBeNull();
    vi.useRealTimers();
  });

  it("keeps exhausted placement controls visible but disabled", () => {
    render(
      <LoungeActionDock
        choices={includedLoungeItems}
        selectedItem={null}
        remaining={0}
        capacity={3}
        placing={false}
        reactionLocked={false}
        onSelectItem={vi.fn()}
        onSendEmote={vi.fn()}
        onSendQuickPhrase={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Stamps, 0 placements left" }),
    );
    expect(
      screen.queryAllByText("0", {
        selector: ".team-lounge__placement-badge",
      }),
    ).toHaveLength(0);
    expect(
      screen.getByText("Complete another training day to place another item."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose Bolt stamp" }),
    ).toBeDisabled();
  });
});
