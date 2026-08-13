"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { consoleCopy } from "../copy";
import { ConsoleChrome, ConsoleNotice } from "../ConsoleChrome";
import { useResource } from "../useResource";
import type { TeamSummary } from "../types";

export interface TeamSection {
  href: string;
  label: string;
}

/**
 * REQ-511. One team, three jobs -- set the plan, review how it is going, manage
 * the people -- each at its own address. They were one scroll of six cards in
 * the order the components happened to be written, so nothing on the screen
 * said which job anything belonged to.
 *
 * The team's own facts sit above the nav because both sections need them and
 * neither owns them.
 */
export function TeamShell({
  teamId,
  back,
  sections,
  children,
}: {
  teamId: string;
  back: { href: string; label: string };
  sections: TeamSection[];
  children: ReactNode;
}) {
  const team = useResource<TeamSummary>(`v1/staff/teams/${teamId}`);
  const pathname = usePathname();

  return (
    <ConsoleChrome
      title={team.data?.name ?? consoleCopy.roster.title}
      back={back}
    >
      {team.error ? <ConsoleNotice message={team.error} /> : null}

      {team.data ? (
        <dl className="console-facts">
          <dt>{consoleCopy.teams.clubLabel}</dt>
          <dd>{team.data.clubName}</dd>
          <dt>{consoleCopy.teams.seasonLabel}</dt>
          <dd>{team.data.seasonId}</dd>
          <dt>{consoleCopy.teams.timeZoneLabel}</dt>
          <dd>{team.data.timeZone}</dd>
          <dt>{consoleCopy.teams.weeklyGoalLabel}</dt>
          <dd>{team.data.weeklyGoal}</dd>
        </dl>
      ) : null}

      {/* Links, not an ARIA tablist: these are documents at addresses, so the
          back button and a bookmark both mean what a coach expects. */}
      <nav
        className="console-nav console-nav--sections"
        aria-label={consoleCopy.sections.label}
      >
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            aria-current={pathname === section.href ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </ConsoleChrome>
  );
}
