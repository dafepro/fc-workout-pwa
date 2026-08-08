"use client";

import { FormEvent, useState } from "react";
import { copy } from "../../../../content/copy";
import { routes } from "../../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../../console/ConsoleChrome";
import { ConfirmButton } from "../../../console/ConfirmButton";
import { CredentialRevealPanel } from "../../../console/RevealOnce";
import { StepUpForm, useStepUp } from "../../../console/StepUp";
import { ConsoleError, consoleRequest, messageFor } from "../../../console/api";
import { useResource } from "../../../console/useResource";
import type { CredentialReveal, PlayerDetail } from "../../../console/types";

/**
 * F-O1 and F-C6 on one screen: everything the operator needs to answer "why
 * can this child not sign in", and every repair inline, so the answer never
 * requires an SSH session.
 */
export function PlayerRepair({ playerId }: { playerId: string }) {
  const player = useResource<PlayerDetail>(`v1/staff/players/${playerId}`);
  const [reveal, setReveal] = useState<CredentialReveal | null>(null);
  const [error, setError] = useState("");
  const stepUp = useStepUp();

  async function act(action: () => Promise<void>) {
    setError("");
    try {
      await stepUp.run(action);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  function credentialAction(action: "unlock" | "revoke") {
    return () =>
      act(async () => {
        await consoleRequest<void>(`v1/staff/players/${playerId}/credential`, {
          method: "POST",
          body: { action },
        });
        player.reload();
      });
  }

  const reissue = () =>
    act(async () => {
      setReveal(
        await consoleRequest<CredentialReveal>(
          `v1/staff/players/${playerId}/credential`,
          { method: "POST", body: { action: "reissue" } },
        ),
      );
      player.reload();
    });

  const detail = player.data;
  const name = detail
    ? `${detail.player.firstName} ${detail.player.lastInitial}`
    : copy.console.player.title;

  return (
    <ConsoleChrome
      title={name}
      back={{
        href: routes.staffAdmin,
        label: copy.console.admin.backToSearch,
      }}
    >
      {player.loading ? <p>{copy.console.loading}</p> : null}
      {player.error ? <ConsoleNotice message={player.error} /> : null}
      {error ? <ConsoleNotice message={error} /> : null}

      {stepUp.pending ? (
        <StepUpForm
          onCancel={stepUp.cancel}
          onConfirmed={async () => {
            try {
              await stepUp.complete();
            } catch (caught) {
              setError(messageFor(caught));
            }
          }}
        />
      ) : null}

      {reveal ? (
        <CredentialRevealPanel
          reveal={reveal}
          onDismiss={() => setReveal(null)}
        />
      ) : null}

      {detail ? (
        <>
          <dl className="console-facts">
            <dt>{copy.console.player.club}</dt>
            <dd>{detail.clubName}</dd>
          </dl>

          <section
            className="console-card"
            aria-label={copy.console.credential.heading}
          >
            <h2 className="console-card__title">
              {copy.console.credential.heading}
            </h2>
            <p className="console-state">
              {copy.console.credential.state[detail.credential.state]}
            </p>
            <dl className="console-facts">
              <dt>{copy.console.credential.issued}</dt>
              <dd>{detail.credential.issuedAt ?? "—"}</dd>
              <dt>{copy.console.credential.lastUsed}</dt>
              <dd>{detail.credential.lastUsedAt ?? "—"}</dd>
              <dt>{copy.console.credential.lockedUntil}</dt>
              <dd>{detail.credential.lockedUntil ?? "—"}</dd>
              <dt>{copy.console.credential.failedAttempts}</dt>
              <dd>{detail.credential.failedAttempts}</dd>
              <dt>{copy.console.credential.activeSessions}</dt>
              <dd>{detail.credential.activeSessions}</dd>
            </dl>
            <div className="console-actions">
              <button
                type="button"
                className="button button--outline"
                disabled={detail.credential.state !== "locked"}
                onClick={credentialAction("unlock")}
              >
                {copy.console.credential.unlock}
              </button>
              <ConfirmButton
                label={copy.console.credential.reissue}
                question={copy.console.credential.reissueConfirm}
                onConfirm={reissue}
              />
              <ConfirmButton
                label={copy.console.credential.revoke}
                question={copy.console.credential.revokeConfirm}
                disabled={detail.credential.state === "revoked"}
                onConfirm={credentialAction("revoke")}
              />
            </div>
          </section>

          <section
            className="console-card"
            aria-label={copy.console.player.memberships}
          >
            <h2 className="console-card__title">
              {copy.console.player.memberships}
            </h2>
            {detail.memberships.length === 0 ? (
              <p>{copy.console.player.noMemberships}</p>
            ) : null}
            <ul className="console-list">
              {detail.memberships.map((membership) => (
                <li key={membership.teamId} className="console-list__row">
                  <strong>{membership.teamName}</strong>
                  <span>
                    {copy.console.player.from} {membership.activeFrom}
                  </span>
                  {membership.activeTo ? (
                    <span>
                      {copy.console.player.to} {membership.activeTo}
                    </span>
                  ) : (
                    <ConfirmButton
                      label={copy.console.player.endMembership}
                      question={copy.console.player.endMembershipConfirm}
                      onConfirm={() =>
                        act(async () => {
                          await consoleRequest<void>(
                            `v1/staff/teams/${membership.teamId}/roster/${playerId}`,
                            { method: "DELETE" },
                          );
                          player.reload();
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section
            className="console-card"
            aria-label={copy.console.player.events}
          >
            <h2 className="console-card__title">
              {copy.console.player.events}
            </h2>
            {detail.recentAuthEvents.length === 0 ? (
              <p>{copy.console.player.noEvents}</p>
            ) : (
              <ul className="console-list">
                {detail.recentAuthEvents.map((event, index) => (
                  <li
                    key={`${event.occurredAt}-${index}`}
                    className="console-list__row"
                  >
                    <span>{event.occurredAt}</span>
                    <strong>{event.eventType}</strong>
                    {event.detail ? <span>{event.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DeactivatePanel
            playerId={playerId}
            expectedName={name}
            onDone={player.reload}
            act={act}
          />
        </>
      ) : null}
    </ConsoleChrome>
  );
}

/**
 * F-O9. The most destructive verb the console has: it needs a typed name, it
 * needs a fresh authentication (SEC-3, handled by the shared step-up), and it
 * erases nothing.
 */
function DeactivatePanel({
  playerId,
  expectedName,
  onDone,
  act,
}: {
  playerId: string;
  expectedName: string;
  onDone: () => void;
  act: (action: () => Promise<void>) => Promise<void>;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    await act(async () => {
      try {
        await consoleRequest<void>(`v1/staff/players/${playerId}/deactivate`, {
          method: "POST",
          body: { confirmName },
        });
      } catch (caught) {
        if (
          caught instanceof ConsoleError &&
          caught.code === "confirmation_mismatch"
        ) {
          setError(copy.console.player.deactivateMismatch);
          return;
        }
        throw caught;
      }
      setDone(true);
      setConfirmName("");
      onDone();
    });
  }

  return (
    <section
      className="console-card console-card--danger"
      aria-label={copy.console.player.deactivateHeading}
    >
      <h2 className="console-card__title">
        {copy.console.player.deactivateHeading}
      </h2>
      <p>{copy.console.player.deactivateBody}</p>
      {done ? (
        <p className="console-state">{copy.console.player.deactivated}</p>
      ) : null}
      <form onSubmit={submit} noValidate className="console-form">
        <label htmlFor="confirm-name">
          {copy.console.player.deactivateLabel}
        </label>
        <input
          id="confirm-name"
          name="confirmName"
          type="text"
          autoComplete="off"
          placeholder={expectedName}
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--danger"
          disabled={!confirmName.trim()}
        >
          {copy.console.player.deactivate}
        </button>
      </form>
    </section>
  );
}
