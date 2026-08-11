import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copy } from "../content/copy";
import { AvatarBuilder } from "./AvatarBuilder";
import { defaultAvatar } from "./config";

afterEach(cleanup);

function renderBuilder(onSave = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <AvatarBuilder config={defaultAvatar()} onSave={onSave} />,
  );
  return { ...view, onSave };
}

function pick(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function openCategory(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("AvatarBuilder", () => {
  it("shows one category at a time and keeps hats and glasses inside Gear", () => {
    renderBuilder();
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.head }),
    ).toBeInTheDocument();

    openCategory(copy.avatar.categories.gear);

    expect(
      screen.queryByRole("group", { name: copy.avatar.legends.head }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.hat }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.eyewear }),
    ).toBeInTheDocument();
  });

  it("shows isolated item art instead of a complete avatar in choices", () => {
    const { container } = renderBuilder();
    expect(
      container.querySelectorAll(".avatar-part-art").length,
    ).toBeGreaterThan(0);
    expect(container.querySelector(".avatar-choice .avatar-art")).toBeNull();
    for (const preview of container.querySelectorAll(".avatar-part-art")) {
      expect(preview.querySelectorAll(".avatar-part-art__layer")).toHaveLength(
        1,
      );
    }
  });

  it("uses compact unlabeled tokens while retaining accessible names", () => {
    const { container } = renderBuilder();
    expect(
      container.querySelector(".avatar-builder__tray"),
    ).toBeInTheDocument();
    expect(container.querySelector(".avatar-choice__label")).toBeNull();
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.personRound }),
    ).toBeInTheDocument();
  });

  it("disables advancement-locked animals", () => {
    renderBuilder();
    expect(
      screen.getByRole("radio", { name: /Rover the dog.*locked/i }),
    ).toBeDisabled();
    expect(screen.getAllByText("🔒")).toHaveLength(3);
  });

  it("equips a hat and glasses simultaneously", async () => {
    const { onSave } = renderBuilder();
    openCategory(copy.avatar.categories.gear);
    pick(copy.avatar.options.hat.cap);
    pick(copy.avatar.options.eyewear.round);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    expect(onSave).toHaveBeenCalledWith({
      version: "3",
      background: "solid",
      effect: "none",
      kit: "violet",
      head: "person-round",
      hat: "cap",
      eyewear: "round",
      backgroundColor: "#755ee8",
      avatarColor: "#66d0ff",
      accentColor: "#302c61",
    });
    await waitFor(() =>
      expect(screen.getByText(copy.avatar.saved)).toBeInTheDocument(),
    );
  });

  it("changes avatar, accent, and solid background colors", async () => {
    const { onSave } = renderBuilder();
    openCategory(copy.avatar.categories.colors);
    fireEvent.change(screen.getByLabelText(copy.avatar.colors.avatar), {
      target: { value: "#22aacc" },
    });
    fireEvent.change(screen.getByLabelText(copy.avatar.colors.accent), {
      target: { value: "#112233" },
    });
    fireEvent.change(screen.getByLabelText(copy.avatar.colors.background), {
      target: { value: "#ffeeaa" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarColor: "#22aacc",
        accentColor: "#112233",
        backgroundColor: "#ffeeaa",
      }),
    );
  });

  it("applies the animated background effect", () => {
    const { container } = renderBuilder();
    openCategory(copy.avatar.categories.effect);
    pick(copy.avatar.options.effect.orbit);
    expect(
      container.querySelector(
        ".avatar-builder__preview .avatar-effect--animated",
      ),
    ).toBeInTheDocument();
  });

  it("uses the tall Studio framing only for the live preview", () => {
    const { container } = renderBuilder();
    expect(
      container.querySelector(".avatar-builder__preview .avatar-art--studio"),
    ).toHaveAttribute("viewBox", "0 0 64 82");
    expect(container.querySelector(".avatar-part-art--studio")).toBeNull();
  });

  it("uses minimal action and preview copy", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.queryByText("Live preview")).not.toBeInTheDocument();
    expect(screen.queryByText(/Mason's look/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save look" })).toBeNull();
  });

  it("reports a failed save without losing the draft", async () => {
    renderBuilder(vi.fn().mockRejectedValue(new Error("nope")));
    pick(copy.avatar.options.head.personTall);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.personTall }),
    ).toBeChecked();
  });

  it("resets the draft to the saved look", () => {
    renderBuilder();
    pick(copy.avatar.options.head.personTall);
    fireEvent.click(screen.getByRole("button", { name: copy.avatar.reset }));
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.personRound }),
    ).toBeChecked();
  });

  it("starts an old configuration from the v3 people default", () => {
    render(
      <AvatarBuilder
        config={{ version: "2", head: "cheetah" }}
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.personRound }),
    ).toBeChecked();
  });
});
