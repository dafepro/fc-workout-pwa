import Link from "next/link";
import { playerExperienceCopy } from "../content";

const previousViews = [
  {
    title: "Classic Alpha",
    detail: "The original dashboard, team progress, and leaders view.",
    href: "/classic-alpha",
  },
  {
    title: "Momentum Alpha",
    detail: "The simplified momentum trail experiment.",
    href: "/momentum-alpha",
  },
  {
    title: "Team Canvas",
    detail: "The focused daily card and standalone canvas experiment.",
    href: "/team-canvas",
  },
] as const;

export function PreviousViews() {
  const copy = playerExperienceCopy.previousViews;
  return (
    <section className="previous-views" aria-labelledby="previous-views-title">
      <p className="player-eyebrow">{copy.eyebrow}</p>
      <h2 id="previous-views-title">{copy.title}</h2>
      <p>{copy.body}</p>
      <div>
        {previousViews.map((view) => (
          <Link key={view.href} href={view.href}>
            <span>
              <strong>{view.title}</strong>
              <small>{view.detail}</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
