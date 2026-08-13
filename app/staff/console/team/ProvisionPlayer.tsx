"use client";

import { FormEvent, useState } from "react";

import { consoleCopy, staffCopy } from "../copy";
import { ConsoleError, consoleRequest, messageFor } from "../api";
import type { CredentialReveal } from "../types";

/** F-C5. First name and last initial only, and the reveal happens once. */
export function ProvisionPlayer({
  teamId,
  onProvisioned,
}: {
  teamId: string;
  onProvisioned: (reveal: CredentialReveal) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await consoleRequest<CredentialReveal>(
        `v1/staff/teams/${teamId}/players`,
        {
          method: "POST",
          body: { firstName: firstName.trim(), lastInitial },
        },
      );
      setFirstName("");
      setLastInitial("");
      onProvisioned(created);
    } catch (caught) {
      // SEC-7: the console must not become the way real children's data gets
      // created before the deployment is approved for it.
      setError(
        caught instanceof ConsoleError && caught.code === "provisioning_locked"
          ? consoleCopy.roster.provisionLocked
          : messageFor(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="console-card" aria-label={consoleCopy.roster.provision}>
      <h2 className="console-card__title">{consoleCopy.roster.provision}</h2>
      <p className="console-hint">{consoleCopy.roster.provisionHint}</p>
      <form method="post" onSubmit={submit} noValidate className="console-form">
        <label htmlFor="provision-first-name">
          {consoleCopy.roster.firstNameLabel}
        </label>
        <input
          id="provision-first-name"
          name="firstName"
          type="text"
          autoComplete="off"
          maxLength={40}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <label htmlFor="provision-last-initial">
          {consoleCopy.roster.lastInitialLabel}
        </label>
        <input
          id="provision-last-initial"
          name="lastInitial"
          type="text"
          autoComplete="off"
          maxLength={1}
          pattern="[A-Za-z]"
          value={lastInitial}
          onChange={(event) =>
            setLastInitial(
              event.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1),
            )
          }
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--lime"
          disabled={busy || !firstName.trim() || !lastInitial}
        >
          {busy ? staffCopy.working : consoleCopy.roster.provisionAction}
        </button>
      </form>
    </section>
  );
}
