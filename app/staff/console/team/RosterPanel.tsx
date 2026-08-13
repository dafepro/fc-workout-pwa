"use client";

import { useState } from "react";
import Link from "next/link";

import { consoleCopy } from "../copy";
import { ConsoleNotice } from "../ConsoleChrome";
import { ConfirmButton } from "../ConfirmButton";
import { CredentialRevealPanel } from "../RevealOnce";
import { RevealDialog } from "../RevealDialog";
import { consoleRequest, messageFor } from "../api";
import { useResource } from "../useResource";
import { AddExistingPlayer } from "./AddExistingPlayer";
import { ProvisionPlayer } from "./ProvisionPlayer";
import type { CredentialReveal, RosterEntry } from "../types";

/**
 * F-C2 through F-C6: the people on this team, and everything done to a place on
 * it. The credential reveal lives here because this is where it is produced --
 * it used to be lifted to the whole team screen and rendered above everything,
 * which put it off-screen from the form that made it.
 */
export function RosterPanel({
  teamId,
  playerHref,
  operator,
}: {
  teamId: string;
  playerHref: (playerId: string) => string;
  /** Adding an existing player needs the platform-wide player search, which is
   * operator-only in the API. A coach was already refused it; hiding the panel
   * is what stops the refusal arriving as an error they can do nothing about. */
  operator: boolean;
}) {
  const roster = useResource<{ roster: RosterEntry[] }>(
    `v1/staff/teams/${teamId}/roster`,
  );
  const [reveal, setReveal] = useState<CredentialReveal | null>(null);
  const [error, setError] = useState("");

  async function act(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  return (
    <>
      {roster.error ? <ConsoleNotice message={roster.error} /> : null}
      {error ? <ConsoleNotice message={error} /> : null}

      {reveal ? (
        <RevealDialog
          acknowledgement={consoleCopy.reveal.acknowledge}
          onDismiss={() => setReveal(null)}
        >
          <CredentialRevealPanel reveal={reveal} />
        </RevealDialog>
      ) : null}

      <section className="console-card" aria-label={consoleCopy.roster.title}>
        <h2 className="console-card__title">{consoleCopy.roster.title}</h2>
        {roster.loading ? <p>{consoleCopy.loading}</p> : null}
        {roster.data && roster.data.roster.length === 0 ? (
          <p>{consoleCopy.roster.empty}</p>
        ) : null}
        <ul className="console-list">
          {(roster.data?.roster ?? []).map((entry) => (
            <li key={entry.playerId} className="console-list__row">
              <Link href={playerHref(entry.playerId)}>
                {entry.firstName} {entry.lastInitial}
              </Link>
              <span>{consoleCopy.credential.state[entry.credentialState]}</span>
              <span>
                {consoleCopy.player.from} {entry.membershipFrom}
              </span>
              <span>
                {consoleCopy.roster.lastActivity}:{" "}
                {entry.lastActivityOn ?? consoleCopy.roster.never}
              </span>
              {entry.membershipTo ? (
                <span>
                  {consoleCopy.player.to} {entry.membershipTo}
                </span>
              ) : (
                <ConfirmButton
                  label={consoleCopy.roster.endMembership}
                  question={consoleCopy.player.endMembershipConfirm}
                  onConfirm={() =>
                    act(async () => {
                      await consoleRequest<void>(
                        `v1/staff/teams/${teamId}/roster/${entry.playerId}`,
                        { method: "DELETE" },
                      );
                      roster.reload();
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {operator ? (
        <AddExistingPlayer teamId={teamId} onAdded={() => roster.reload()} />
      ) : null}

      <ProvisionPlayer
        teamId={teamId}
        onProvisioned={(created) => {
          setReveal(created);
          roster.reload();
        }}
      />
    </>
  );
}
