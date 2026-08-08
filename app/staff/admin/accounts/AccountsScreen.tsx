"use client";

import { staffCopy } from "../../console/copy";

import { FormEvent, useState } from "react";
import { copy } from "../../../content/copy";
import { routes } from "../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../console/ConsoleChrome";
import { ConfirmButton } from "../../console/ConfirmButton";
import { InvitationPanel } from "../../console/RevealOnce";
import { StepUpForm, useStepUp } from "../../console/StepUp";
import { consoleRequest, messageFor } from "../../console/api";
import { useResource } from "../../console/useResource";
import type {
  ClubSummary,
  StaffAccount,
  StaffInvitation,
  TeamSummary,
} from "../../console/types";
import { AdminNav } from "../AdminNav";

const CREATABLE_ROLES = ["coach", "club_admin"] as const;

/** F-O5, F-O6, F-O7. */
export function AccountsScreen() {
  const accounts = useResource<{ staff: StaffAccount[] }>("v1/staff/accounts");
  const clubs = useResource<{ clubs: ClubSummary[] }>("v1/staff/clubs");
  const teams = useResource<{ teams: TeamSummary[] }>("v1/staff/teams");
  const [invitation, setInvitation] = useState<StaffInvitation | null>(null);
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

  return (
    <ConsoleChrome
      title={copy.console.accounts.title}
      back={{ href: routes.staffAdmin, label: copy.console.admin.backToSearch }}
    >
      <AdminNav />
      {accounts.error ? <ConsoleNotice message={accounts.error} /> : null}
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

      {invitation ? (
        <InvitationPanel
          invitation={invitation}
          onDismiss={() => setInvitation(null)}
        />
      ) : null}

      <CreateAccount
        clubs={clubs.data?.clubs ?? []}
        onCreated={(created) => {
          setInvitation(created);
          accounts.reload();
        }}
      />

      <section
        className="console-card"
        aria-label={copy.console.accounts.title}
      >
        <h2 className="console-card__title">{copy.console.accounts.title}</h2>
        {accounts.loading ? <p>{copy.console.loading}</p> : null}
        {accounts.data && accounts.data.staff.length === 0 ? (
          <p>{copy.console.accounts.empty}</p>
        ) : null}
        <ul className="console-list">
          {(accounts.data?.staff ?? []).map((account) => (
            <li key={account.accountId} className="console-list__item">
              <div className="console-list__row">
                <strong>{account.email}</strong>
                <span>{roleLabel(account.role)}</span>
                <span>{account.status}</span>
                <span>
                  {account.setupComplete
                    ? copy.console.accounts.setupComplete
                    : copy.console.accounts.setupPending}
                </span>
                <span>
                  {copy.console.accounts.lastUsed}: {account.lastUsedAt ?? "—"}
                </span>
                <ConfirmButton
                  label={copy.console.accounts.reset}
                  question={copy.console.accounts.resetConfirm}
                  onConfirm={() =>
                    act(async () => {
                      setInvitation(
                        await consoleRequest<StaffInvitation>(
                          `v1/staff/accounts/${account.accountId}/reset`,
                          { method: "POST" },
                        ),
                      );
                      accounts.reload();
                    })
                  }
                />
              </div>
              <TeamAssignment
                accountId={account.accountId}
                teams={teams.data?.teams ?? []}
                act={act}
              />
            </li>
          ))}
        </ul>
      </section>
    </ConsoleChrome>
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = copy.console.accounts.roles;
  return labels[role] ?? role;
}

function CreateAccount({
  clubs,
  onCreated,
}: {
  clubs: ClubSummary[];
  onCreated: (invitation: StaffInvitation) => void;
}) {
  const [email, setEmail] = useState("");
  const [clubId, setClubId] = useState("");
  const [role, setRole] = useState<string>(CREATABLE_ROLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(
        await consoleRequest<StaffInvitation>("v1/staff/accounts", {
          method: "POST",
          body: { email: email.trim(), clubId: clubId || clubs[0]?.id, role },
        }),
      );
      setEmail("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  if (clubs.length === 0) return <p>{copy.console.teams.needsClub}</p>;

  return (
    <section className="console-card" aria-label={copy.console.accounts.create}>
      <h2 className="console-card__title">{copy.console.accounts.create}</h2>
      <form onSubmit={submit} noValidate className="console-form">
        <label htmlFor="account-email">
          {copy.console.accounts.emailLabel}
        </label>
        <input
          id="account-email"
          name="email"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="account-club">{copy.console.accounts.clubLabel}</label>
        <select
          id="account-club"
          name="clubId"
          value={clubId || clubs[0]?.id}
          onChange={(event) => setClubId(event.target.value)}
          required
        >
          {clubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </select>
        <label htmlFor="account-role">{copy.console.accounts.roleLabel}</label>
        <select
          id="account-role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          required
        >
          {CREATABLE_ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabel(value)}
            </option>
          ))}
        </select>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--lime"
          disabled={busy || !email.trim()}
        >
          {busy ? staffCopy.working : copy.console.accounts.create}
        </button>
      </form>
    </section>
  );
}

/** F-O6. The API exposes no read of an account's current assignments, so this
 * acts on a chosen team rather than listing what is already assigned. */
function TeamAssignment({
  accountId,
  teams,
  act,
}: {
  accountId: string;
  teams: TeamSummary[];
  act: (action: () => Promise<void>) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState("");
  const selected = teamId || teams[0]?.id || "";
  if (teams.length === 0) return null;

  return (
    <div className="console-assign">
      <label htmlFor={`assign-${accountId}`}>
        {copy.console.accounts.assignments}
      </label>
      <select
        id={`assign-${accountId}`}
        value={selected}
        onChange={(event) => setTeamId(event.target.value)}
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <div className="console-actions">
        <button
          type="button"
          className="button button--outline"
          onClick={() =>
            act(() =>
              consoleRequest<void>(
                `v1/staff/accounts/${accountId}/team-assignments`,
                { method: "POST", body: { teamId: selected } },
              ),
            )
          }
        >
          {copy.console.accounts.assign}
        </button>
        <button
          type="button"
          className="button button--danger-outline"
          onClick={() =>
            act(() =>
              consoleRequest<void>(
                `v1/staff/accounts/${accountId}/team-assignments/${selected}`,
                { method: "DELETE" },
              ),
            )
          }
        >
          {copy.console.accounts.unassign}
        </button>
      </div>
    </div>
  );
}
