import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoungeChatSettings } from "./LoungeChatSettings";

describe("Lounge chat settings", () => {
  it("uses an in-canvas settings wheel and enforces the three-pack limit", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LoungeChatSettings
        activePackIDs={["standard", "pirate-1", "gen-alpha"]}
        unlockedPackIDs={[
          "standard",
          "pirate-1",
          "gen-alpha",
          "space-cadet",
          "sideline",
          "snack-attack",
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Quick-message pack settings" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Choose chat packs" }),
    ).toBeVisible();
    expect(screen.getByText("3 of 3 selected")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Standard/u })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Space Cadet/u }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Pirate 1/u }));
    expect(onChange).toHaveBeenLastCalledWith(["standard", "gen-alpha"]);

    rerender(
      <LoungeChatSettings
        activePackIDs={["standard", "gen-alpha"]}
        unlockedPackIDs={[
          "standard",
          "pirate-1",
          "gen-alpha",
          "space-cadet",
          "sideline",
          "snack-attack",
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Space Cadet/u }));
    expect(onChange).toHaveBeenLastCalledWith([
      "standard",
      "gen-alpha",
      "space-cadet",
    ]);
  });

  it("keeps one pack active and provides a labeled close control", () => {
    const onChange = vi.fn();
    render(
      <LoungeChatSettings
        activePackIDs={["standard"]}
        unlockedPackIDs={["standard"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Quick-message pack settings" }),
    );
    expect(screen.getByRole("checkbox", { name: /Standard/u })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Pirate 1/u })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Gen Alpha/u })).toBeDisabled();
    expect(screen.getAllByLabelText("Locked Prize Box reward")).toHaveLength(5);
    fireEvent.click(
      screen.getByRole("button", { name: "Close chat settings" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Choose chat packs" }),
    ).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
