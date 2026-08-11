import { notFound } from "next/navigation";
import { backendBaseURL } from "../../api/backend";
import { AVATAR_LAYERS } from "../catalog";
import { AvatarArt } from "../AvatarArt";
import { normalizeAvatar } from "../config";
import type { AvatarLayerKind } from "../types";

const SIZES = ["small", "medium", "large"] as const;

export default function AvatarPreviewPage() {
  if (backendBaseURL()) notFound();

  const people = layerOptions("head");
  const hats = layerOptions("hat");

  return (
    <div className="page">
      <h1>Avatar art preview</h1>
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
