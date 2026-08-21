import Link from "next/link";
import { routes } from "../content/routes";
import { momentumAlphaCopy } from "../momentum-alpha/content";

export function MomentumAlphaEntry() {
  const content = momentumAlphaCopy.classicEntry;

  return (
    <section
      className="card momentum-alpha-entry"
      aria-labelledby="momentum-alpha-entry-title"
    >
      <div className="momentum-alpha-entry__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="momentum-alpha-entry__copy">
        <p className="eyebrow">{content.eyebrow}</p>
        <h2 id="momentum-alpha-entry-title">{content.title}</h2>
        <p>{content.body}</p>
        <small>{content.note}</small>
      </div>
      <Link className="button button--lime" href={routes.momentumAlphaPrefix}>
        {content.action} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
