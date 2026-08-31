import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "../components/Avatar";
import type { Player } from "../domain/types";
import { AVATAR_LAYERS } from "./catalog";
import { LAYER_ART } from "./art";
import { playerColor } from "./color";
import { defaultAvatar, normalizeAvatar } from "./config";
import { AvatarArt, AvatarPartArt } from "./AvatarArt";

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

afterEach(cleanup);

describe("Avatar with a configuration", () => {
  it("draws vector art instead of initials", () => {
    const { container } = render(
      <Avatar
        player={player}
        config={normalizeAvatar({ head: "person-tall" })}
      />,
    );
    expect(container.querySelector("svg.avatar-art")).not.toBeNull();
    expect(screen.queryByText("MR")).toBeNull();
  });

  it("keeps the player's name as the accessible name", () => {
    const { container } = render(
      <Avatar
        player={player}
        config={normalizeAvatar({ head: "person-tall" })}
      />,
    );
    expect(container.querySelector(".avatar")).toHaveAttribute(
      "aria-label",
      "Mason R.",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("gives the current player a distinct list treatment without visible copy", () => {
    const { container } = render(
      <Avatar player={player} config={defaultAvatar()} isCurrentPlayer />,
    );

    expect(container.querySelector(".avatar")).toHaveClass("avatar--self");
    expect(container.querySelector(".avatar")).toHaveAttribute(
      "aria-label",
      "Mason R., you",
    );
    expect(container.querySelector(".avatar__self-marker")).toBeInTheDocument();
    expect(screen.queryByText("You")).toBeNull();
  });

  it("keeps the current-player marker separate from completion", () => {
    const { container } = render(
      <Avatar player={player} isCurrentPlayer completed />,
    );

    expect(container.querySelector(".avatar__self-marker")).toBeInTheDocument();
    expect(container.querySelector(".avatar__check")).toBeInTheDocument();
  });

  it("never leaks an option id into the DOM", () => {
    const { container } = render(
      <Avatar
        player={player}
        config={normalizeAvatar({
          head: "person-tall",
          hat: "beanie",
          eyewear: "aviators",
          effect: "orbit",
        })}
      />,
    );
    const markup = container.innerHTML;
    for (const id of ["person-tall", "beanie", "aviators", "orbit"]) {
      expect(markup).not.toContain(id);
    }
  });

  it("falls back to initials for a legacy configuration", () => {
    const { container } = render(
      <Avatar player={player} config={{ head: "cheetah" }} />,
    );
    expect(container.querySelector("svg.avatar-art")).toBeNull();
    expect(screen.getByText("MR")).toBeInTheDocument();
    expect(container.querySelector(".avatar")).toHaveStyle({
      background: playerColor(player.id),
    });
  });

  it("falls back to initials for an invalid version 3 option", () => {
    const { container } = render(
      <Avatar
        player={player}
        config={{ ...defaultAvatar(), head: "dragon" }}
      />,
    );
    expect(container.querySelector("svg.avatar-art")).toBeNull();
    expect(screen.getByText("MR")).toBeInTheDocument();
  });

  it("falls back to initials with no configuration", () => {
    const { container } = render(<Avatar player={player} />);
    expect(container.querySelector("svg.avatar-art")).toBeNull();
    expect(screen.getByText("MR")).toBeInTheDocument();
  });

  it("renders the kit beneath the head", () => {
    const { container } = render(
      <Avatar player={player} config={defaultAvatar()} />,
    );
    const layers = [...container.querySelectorAll(".avatar-art__layer")];
    expect(layers.map((layer) => layer.getAttribute("class"))).toEqual([
      "avatar-art__layer avatar-art__layer--background",
      "avatar-art__layer avatar-art__layer--effect",
      "avatar-art__layer avatar-art__layer--kit",
      "avatar-art__layer avatar-art__layer--head",
      "avatar-art__layer avatar-art__layer--hat",
      "avatar-art__layer avatar-art__layer--eyewear",
    ]);
  });

  it("uses a taller crop for the Studio without changing icon framing", () => {
    const { container } = render(
      <>
        <AvatarArt config={defaultAvatar()} />
        <AvatarArt config={defaultAvatar()} framing="studio" />
      </>,
    );
    const [icon, studio] = [...container.querySelectorAll("svg.avatar-art")];
    expect(icon).toHaveAttribute("viewBox", "0 0 64 64");
    expect(studio).toHaveAttribute("viewBox", "0 0 64 82");
    expect(studio).toHaveClass("avatar-art--studio");
  });

  it("can omit the profile-card background when art is embedded in a scene", () => {
    const { container } = render(
      <AvatarArt config={defaultAvatar()} background="transparent" />,
    );

    expect(
      container.querySelector(".avatar-art__layer--background"),
    ).toBeNull();
    expect(container.querySelector(".avatar-art__layer--head")).not.toBeNull();
  });

  it("renders an isolated part without the rest of the avatar", () => {
    const head = AVATAR_LAYERS.find((layer) => layer.kind === "head")!;
    const { container } = render(
      <AvatarPartArt
        kind="head"
        option={head.options[1]}
        config={defaultAvatar()}
      />,
    );
    expect(container.querySelector(".avatar-part-art")).toBeInTheDocument();
    expect(container.querySelectorAll(".avatar-part-art__layer")).toHaveLength(
      1,
    );
    expect(container.querySelector(".avatar-art")).toBeNull();
  });
});

describe("the catalog and the art registry", () => {
  const newUnlocks = [
    ["head", "owl"],
    ["head", "panda"],
    ["head", "lion"],
    ["kit", "checkers"],
    ["kit", "starburst"],
    ["hat", "bucket"],
    ["hat", "wizard"],
    ["eyewear", "lightning"],
    ["eyewear", "hearts"],
    ["effect", "confetti"],
  ] as const;

  const rareUnlocks = [
    ["head", "prism-dragon"],
    ["head", "moon-axolotl"],
    ["kit", "nebula-armor"],
    ["kit", "phoenix-flight"],
    ["hat", "astronaut"],
    ["hat", "crystal-antlers"],
    ["eyewear", "hologram-visor"],
    ["eyewear", "clockwork"],
    ["effect", "aurora"],
    ["effect", "meteor-shower"],
  ] as const;

  it("has art for every catalog option", () => {
    for (const layer of AVATAR_LAYERS) {
      for (const option of layer.options) {
        const art = LAYER_ART[layer.kind](
          { ...option, color: "#000000" },
          defaultAvatar(),
        );
        // "none" is a real, deliberately empty option.
        if (option.id === "none") continue;
        expect(art, `${layer.kind}/${option.id}`).not.toBeNull();
      }
    }
  });

  it("gives every layer a default that exists in its options", () => {
    for (const layer of AVATAR_LAYERS) {
      expect(layer.options.map((option) => option.id)).toContain(
        layer.defaultOptionID,
      );
    }
  });

  it("starts with three people and advancement-locks every reward head", () => {
    const people = AVATAR_LAYERS.find((layer) => layer.kind === "head")!;
    expect(people.options.filter((option) => !option.unlock)).toHaveLength(3);
    expect(
      people.options.filter((option) => option.unlock).map(({ id }) => id),
    ).toEqual([
      "dog",
      "cheetah",
      "fox",
      "owl",
      "panda",
      "lion",
      "prism-dragon",
      "moon-axolotl",
    ]);
  });

  it("registers ten distinct advancement rewards with non-empty vector art", () => {
    const signatures = newUnlocks.map(([kind, id]) => {
      const layer = AVATAR_LAYERS.find((candidate) => candidate.kind === kind)!;
      const option = layer.options.find((candidate) => candidate.id === id)!;
      expect(option.unlock, `${kind}/${id}`).toBe("advancement");
      const { container, unmount } = render(
        <AvatarPartArt kind={kind} option={option} config={defaultAvatar()} />,
      );
      const signature = container.innerHTML;
      expect(
        container.querySelector("path, circle, ellipse, rect, polygon"),
        `${kind}/${id}`,
      ).toBeInTheDocument();
      unmount();
      return signature;
    });

    expect(new Set(signatures)).toHaveProperty("size", newUnlocks.length);
  });

  it("registers ten highly detailed rare rewards with distinct vector art", () => {
    const signatures = rareUnlocks.map(([kind, id]) => {
      const layer = AVATAR_LAYERS.find((candidate) => candidate.kind === kind)!;
      const option = layer.options.find((candidate) => candidate.id === id)!;
      expect(option.unlock, `${kind}/${id}`).toBe("advancement");
      const { container, unmount } = render(
        <AvatarPartArt kind={kind} option={option} config={defaultAvatar()} />,
      );
      const signature = container.innerHTML;
      expect(
        container.querySelectorAll("path, circle, ellipse, rect, polygon, line")
          .length,
        `${kind}/${id}`,
      ).toBeGreaterThanOrEqual(8);
      unmount();
      return signature;
    });

    expect(new Set(signatures)).toHaveProperty("size", rareUnlocks.length);
  });

  it("keeps hats and glasses as independent paint layers", () => {
    expect(AVATAR_LAYERS.some((layer) => layer.kind === "hat")).toBe(true);
    expect(AVATAR_LAYERS.some((layer) => layer.kind === "eyewear")).toBe(true);
  });

  it("has one solid background style and an animated effect", () => {
    const background = AVATAR_LAYERS.find(
      (layer) => layer.kind === "background",
    )!;
    const effect = AVATAR_LAYERS.find((layer) => layer.kind === "effect")!;
    expect(background.options.map(({ id }) => id)).toEqual(["solid"]);
    expect(effect.options.map(({ id }) => id)).toEqual([
      "none",
      "orbit",
      "pulse",
      "confetti",
      "aurora",
      "meteor-shower",
    ]);
  });

  it("uses a symmetric kit shoulder path", () => {
    const { container } = render(<AvatarArt config={defaultAvatar()} />);
    expect(container.querySelector(".avatar-kit__body")).toHaveAttribute(
      "d",
      "M3 82V61Q3 52 21 47L27 45.5Q32 51 37 45.5L43 47Q61 52 61 61V82Z",
    );
  });

  it("keeps every kit visually distinct when colors are customized", () => {
    const kit = AVATAR_LAYERS.find((layer) => layer.kind === "kit")!;
    const signatures = kit.options.map((option) => {
      const { container, unmount } = render(
        <AvatarPartArt kind="kit" option={option} config={defaultAvatar()} />,
      );
      const signature = container.innerHTML;
      unmount();
      return signature;
    });

    expect(new Set(signatures)).toHaveProperty("size", kit.options.length);
  });
});
