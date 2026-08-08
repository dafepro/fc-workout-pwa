"use client";

import { staffCopy } from "../../console/copy";

import { FormEvent, useState } from "react";
import { copy } from "../../../content/copy";
import { routes } from "../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../console/ConsoleChrome";
import { consoleRequest, messageFor } from "../../console/api";
import { useResource } from "../../console/useResource";
import type { ClubSummary } from "../../console/types";
import { AdminNav } from "../AdminNav";

/** F-O2. */
export function ClubsScreen() {
  const clubs = useResource<{ clubs: ClubSummary[] }>("v1/staff/clubs");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await consoleRequest<ClubSummary>("v1/staff/clubs", {
        method: "POST",
        body: { name: name.trim() },
      });
      setName("");
      clubs.reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleChrome
      title={copy.console.clubs.title}
      back={{ href: routes.staffAdmin, label: copy.console.admin.backToSearch }}
    >
      <AdminNav />
      {clubs.error ? <ConsoleNotice message={clubs.error} /> : null}
      {error ? <ConsoleNotice message={error} /> : null}

      <section className="console-card" aria-label={copy.console.clubs.create}>
        <h2 className="console-card__title">{copy.console.clubs.create}</h2>
        <form onSubmit={submit} noValidate className="console-form">
          <label htmlFor="club-name">{copy.console.clubs.nameLabel}</label>
          <input
            id="club-name"
            name="name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <button
            className="button button--lime"
            disabled={busy || !name.trim()}
          >
            {busy ? staffCopy.working : copy.console.clubs.create}
          </button>
        </form>
      </section>

      <section className="console-card" aria-label={copy.console.clubs.title}>
        <h2 className="console-card__title">{copy.console.clubs.title}</h2>
        {clubs.loading ? <p>{copy.console.loading}</p> : null}
        {clubs.data && clubs.data.clubs.length === 0 ? (
          <p>{copy.console.clubs.empty}</p>
        ) : null}
        <ul className="console-list">
          {(clubs.data?.clubs ?? []).map((club) => (
            <li key={club.id} className="console-list__row">
              <strong>{club.name}</strong>
              <span>{copy.console.clubs.teamCount(club.teamCount)}</span>
              <span>{club.createdAt}</span>
            </li>
          ))}
        </ul>
      </section>
    </ConsoleChrome>
  );
}
