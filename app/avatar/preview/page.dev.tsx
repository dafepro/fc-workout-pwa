import { notFound } from "next/navigation";
import { backendBaseURL } from "../../api/backend";
import { AVATAR_LAYERS } from "../catalog";
import { AvatarArt } from "../AvatarArt";
import { normalizeAvatar } from "../config";
import type { AvatarLayerKind } from "../types";

const SIZES = ["small", "medium", "large"] as const;
const RARE_REWARD_IDS = new Set([
  "prism-dragon",
  "moon-axolotl",
  "nebula-armor",
  "phoenix-flight",
  "astronaut",
  "crystal-antlers",
  "hologram-visor",
  "clockwork",
  "aurora",
  "meteor-shower",
]);

const RARE_COMBINATIONS = [
  {
    label: "Prism voyager",
    config: {
      head: "prism-dragon",
      kit: "nebula-armor",
      hat: "astronaut",
      eyewear: "hologram-visor",
      effect: "aurora",
    },
  },
  {
    label: "Moonfire guardian",
    config: {
      head: "moon-axolotl",
      kit: "phoenix-flight",
      hat: "crystal-antlers",
      eyewear: "clockwork",
      effect: "meteor-shower",
    },
  },
] as const;

export default function AvatarPreviewPage() {
  if (backendBaseURL()) notFound();

  const people = layerOptions("head");
  const hats = layerOptions("hat");

  return (
    <div className="page">
      <h1>Avatar art preview</h1>
      <section className="card">
        <h2>Rare reward collection</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
            gap: "1rem",
          }}
        >
          {rareRewards().map(({ kind, id, label }) => (
            <article key={`${kind}-${id}`} style={{ textAlign: "center" }}>
              <h3>{label}</h3>
              <span
                className="avatar-builder__portrait"
                style={{ width: "6rem", margin: "0 auto" }}
                title={label}
              >
                <AvatarArt
                  config={normalizeAvatar({ [kind]: id })}
                  framing="studio"
                />
              </span>
            </article>
          ))}
          {RARE_COMBINATIONS.map(({ label, config }) => (
            <article key={label} style={{ textAlign: "center" }}>
              <h3>{label}</h3>
              <span
                className="avatar-builder__portrait"
                style={{ width: "6rem", margin: "0 auto" }}
                title={label}
              >
                <AvatarArt config={normalizeAvatar(config)} framing="studio" />
              </span>
            </article>
          ))}
        </div>
      </section>
      {people.map((head) => (
        <section key={head} className="card">
          <h2>{head}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {hats.map((hat) =>
              SIZES.map((size) => (
                <span
                  key={`${hat}-${size}`}
                  className={`avatar avatar--${size}`}
                  title={`${head} / ${hat} / ${size}`}
                >
                  <AvatarArt
                    config={normalizeAvatar({
                      head,
                      hat,
                      eyewear: "round",
                      effect: "orbit",
                    })}
                  />
                </span>
              )),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function layerOptions(kind: AvatarLayerKind): string[] {
  const layer = AVATAR_LAYERS.find((candidate) => candidate.kind === kind)!;
  return layer.options.map((option) => option.id);
}

function rareRewards() {
  return AVATAR_LAYERS.flatMap((layer) =>
    layer.options
      .filter(({ id }) => RARE_REWARD_IDS.has(id))
      .map(({ id, label }) => ({ kind: layer.kind, id, label })),
  );
}
