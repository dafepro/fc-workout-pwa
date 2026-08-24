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
      screen
        .getByRole("navigation", { name: "Avatar categories" })
        .querySelectorAll("button"),
    ).toHaveLength(7);
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

  it("edits eyes, mouth, and facial hair in separate categories", () => {
    renderBuilder();
    openCategory(copy.avatar.categories.eyes);
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.eyes }),
    ).toBeInTheDocument();
    openCategory(copy.avatar.categories.mouth);
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.mouth }),
    ).toBeInTheDocument();
    openCategory(copy.avatar.categories.facialHair);
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.facialHair }),
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
      version: "5",
      background: "solid",
      effect: "none",
      kit: "violet",
      head: "person-round",
      eyes: "bright",
      mouth: "smile",
      facialHair: "none",
      hat: "cap",
      eyewear: "round",
      headPalette: "#66d0ff:#302c61",
      kitPalette: "#6954ee:#c8f52a",
      hatPalette: "#302c61:#66d0ff",
      eyewearPalette: "#f3ad16:#241d3d",
      backgroundColor: "#755ee8",
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("applies preset colors live from a two-tap wheel without an Apply step", async () => {
    const { onSave } = renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Person color" }));
    fireEvent.click(screen.getByRole("button", { name: "Aqua" }));

    expect(
      document.querySelector(
        '.avatar-builder__preview .avatar-art__layer--head [fill="#22aacc"]',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Person color" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Person color" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Person accent" }));
    fireEvent.click(screen.getByRole("button", { name: "Ink" }));

    openCategory(copy.avatar.categories.kit);
    fireEvent.click(screen.getByRole("button", { name: "Kit color" }));
    expect(screen.getByRole("dialog", { name: "Kit color" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: copy.avatar.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        headPalette: "#22aacc:#241d3d",
        kitPalette: "#6954ee:#c8f52a",
      }),
    );
  });

  it("closes the live color wheel when tapping outside", () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Person color" }));
    expect(screen.getByRole("dialog", { name: "Person color" })).toBeVisible();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("dialog", { name: "Person color" })).toBeNull();
  });

  it("groups Color and FX under Background and applies pulse", () => {
    const { container } = renderBuilder();
    openCategory(copy.avatar.categories.background);
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.background }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: copy.avatar.legends.effect }),
    ).toBeInTheDocument();
    pick(copy.avatar.options.effect.pulse);
    expect(
      container.querySelector(".avatar-builder__preview .avatar-effect--pulse"),
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
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
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

  it("starts an old configuration from the v4 people default", () => {
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

  it("adopts a valid configuration that finishes loading after mount", () => {
    const onSave = vi.fn();
    const { rerender } = render(<AvatarBuilder config={{}} onSave={onSave} />);
    const loaded = {
      ...defaultAvatar(),
      head: "person-tall",
      effect: "pulse",
    };

    rerender(<AvatarBuilder config={loaded} onSave={onSave} />);

    expect(
      screen.getByRole("radio", { name: copy.avatar.options.head.personTall }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: copy.avatar.save }),
    ).toBeDisabled();
  });
});
