import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copy } from "../content/copy";
import type { Player } from "../domain/types";
import { AvatarBuilder } from "./AvatarBuilder";
import { playerColor } from "./color";
import { defaultAvatar } from "./config";

afterEach(cleanup);

const player: Player = {
  id: "player-mason",
  firstName: "Mason",
  lastInitial: "R.",
  initials: "MR",
  avatarColor: playerColor("player-mason"),
  weeklySessions: 0,
  effortPoints: 0,
  currentStreak: 0,
  consistency: 0,
};

function renderBuilder(onSave = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <AvatarBuilder player={player} config={defaultAvatar()} onSave={onSave} />,
  );
  return { ...view, onSave };
}

function pick(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

describe("AvatarBuilder", () => {
  it("offers a fieldset per layer with native radios", () => {
    renderBuilder();
    for (const legend of Object.values(copy.avatar.legends)) {
      expect(screen.getByRole("group", { name: legend })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.cheetah }),
    ).toBeInTheDocument();
  });

  it("updates the preview when a head is picked", () => {
    const { container } = renderBuilder();
    const preview = () =>
      container.querySelector(".avatar-builder__preview .avatar-art")!
        .innerHTML;

    const before = preview();
    pick(copy.avatar.options.head.cheetah);

    expect(preview()).not.toBe(before);
  });

  it("sends the whole draft on save", async () => {
    const { onSave } = renderBuilder();

    pick(copy.avatar.options.head.cheetah);
    pick(copy.avatar.options.background.sky);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    expect(onSave).toHaveBeenCalledWith({
      background: "sky",
      head: "cheetah",
      eyewear: "none",
    });
    await waitFor(() =>
      expect(screen.getByText(copy.avatar.saved)).toBeInTheDocument(),
    );
  });

  it("reports a failed save without losing the draft", async () => {
    const { container } = renderBuilder(
      vi.fn().mockRejectedValue(new Error("nope")),
    );

    pick(copy.avatar.options.head.cheetah);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    await waitFor(() =>
      expect(container.querySelector(".notice--error")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.cheetah }),
    ).toBeChecked();
  });

  it("returns the draft to the saved look on start over", () => {
    renderBuilder();

    pick(copy.avatar.options.head.cheetah);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.cancel }));

    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.dog }),
    ).toBeChecked();
  });

  it("names swatches by label, never by hex or slug", () => {
    renderBuilder();
    const swatch = screen.getByRole("radio", {
      name: copy.avatar.options.background.ocean,
    });
    expect(swatch.closest("label")!.textContent).toBe(
      copy.avatar.options.background.ocean,
    );
  });
});
