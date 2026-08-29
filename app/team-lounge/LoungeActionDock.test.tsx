import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  definitionVersion: 3,
  source: "earned",
  kind: "lounge_prop",
};

describe("Lounge action dock", () => {
  it("uses the consolidated V2 action bar and categorized item sheet", async () => {
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
    ).toEqual(["✦Stamps", "▣Items", "▤Chat", "☺React"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

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
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "React" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a reaction" }),
    ).toHaveAttribute("data-anchor", "react");
    fireEvent.click(screen.getByRole("button", { name: "Send Wave emote" }));
    expect(onSendEmote).toHaveBeenCalledWith(loungeEmotes[0]);

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    const chatSets = screen.getByRole("dialog", { name: "Choose a chat set" });
    expect(chatSets).toHaveAttribute("data-anchor", "chat");
    expect(screen.getByRole("button", { name: "Standard" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Set 2, locked" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Set 3, locked" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Send Nice! quick message" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a Standard message" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: / quick message$/u }),
    ).toHaveLength(10);
    fireEvent.click(
      screen.getByRole("button", { name: "Send Hi! quick message" }),
    );
    expect(onSendQuickPhrase).toHaveBeenCalledWith(loungeQuickPhrases[0]);
  });

  it("slides an open tray down before removing it", () => {
    vi.useFakeTimers();
    render(
      <LoungeActionDock
        choices={includedLoungeItems}
        selectedItem={null}
        remaining={2}
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
