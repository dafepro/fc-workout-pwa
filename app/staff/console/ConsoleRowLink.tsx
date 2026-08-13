import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A list row that is entirely one destination.
 *
 * Alpha 1.1: a search result's team name was a bare `<Link>` among plain
 * `<span>`s, and the base reset gives every anchor `color: inherit` and no
 * underline -- so the one word that navigated looked exactly like the words that
 * did not. The whole row is the anchor now, which fixes the affordance and the
 * touch target at once: `name` carries the underline, the facts stay muted
 * beside it, and a chevron sits at the far end.
 *
 * Only for rows with no other control in them. An anchor may not contain a
 * button, so a row that ends in "End membership" keeps its inline link and uses
 * `.console-link` instead.
 */
export function ConsoleRowLink({
  href,
  name,
  children,
}: {
  href: string;
  /** The row's subject, and the part that reads as a link. */
  name: string;
  /** The muted facts beside it, as `<span>`s. */
  children?: ReactNode;
}) {
  return (
    <li>
      {/* Labelled, because an anchor wrapping the whole row would otherwise take
          its accessible name from every fact in it -- "Ada B Sessions: 3/3
          Streak: 4". The facts stay in the tree to be read; only the link's own
          name is trimmed back to its destination. */}
      <Link className="console-row-link" href={href} aria-label={name}>
        <strong className="console-row-link__name">{name}</strong>
        {children}
        <span className="console-row-link__go" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
