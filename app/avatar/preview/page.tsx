import { notFound } from "next/navigation";
import { backendBaseURL } from "../../api/backend";
import { AVATAR_LAYERS } from "../catalog";
import { playerColor } from "../color";
import { AvatarArt } from "../AvatarArt";

const SIZES = ["small", "medium", "large"] as const;

/** An art playground, not a product screen: it exists only in the unconfigured
 * prototype/dev mode, so a production Worker release cannot reach it. */
export default function AvatarPreviewPage() {
  if (backendBaseURL()) notFound();

  const heads = layerOptions("head");
  const eyewear = layerOptions("eyewear");
  const backgrounds = layerOptions("background");
  const fallback = playerColor("player-mason");

  return (
    <div className="page">
      <h1>Avatar art preview</h1>
      <p>Every head against every pair of shades, then every background.</p>
      {heads.map((head) => (
        <section key={head} className="card">
          <h2>{head}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {eyewear.map((eyes) =>
              SIZES.map((size) => (
                <span
                  key={`${eyes}-${size}`}
                  className={`avatar avatar--${size}`}
                  title={`${head} / ${eyes} / ${size}`}
                >
                  <AvatarArt
                    config={{ head, eyewear: eyes }}
                    fallbackBackground={fallback}
                  />
                </span>
              )),
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            {backgrounds.map((background) => (
              <span
                key={background}
                className="avatar avatar--medium"
                title={`${head} / ${background}`}
              >
                <AvatarArt
                  config={{ head, background, eyewear: "aviators" }}
                  fallbackBackground={fallback}
                />
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function layerOptions(kind: string): string[] {
  const layer = AVATAR_LAYERS.find((candidate) => candidate.kind === kind)!;
  return layer.options.map((option) => option.id);
}
