"use client";

import { consoleCopy, staffCopy } from "../../console/copy";

import { FormEvent, useState } from "react";
import { routes } from "../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../console/ConsoleChrome";
import { consoleRequest, messageFor } from "../../console/api";
import type { AuditEvent } from "../../console/types";
import { AdminNav } from "../AdminNav";

const ROW_LIMITS = [25, 50, 100, 200];

/** F-O10. Opaque keys only: the trail names rows, never children. */
export function AuditScreen() {
  const [accountId, setAccountId] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(50);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await consoleRequest<{ events: AuditEvent[] }>(
        "v1/staff/audit",
        {
          query: {
            accountId: accountId.trim() || undefined,
            since: since || undefined,
            limit: String(limit),
          },
        },
      );
      setEvents(result.events);
    } catch (caught) {
      setError(messageFor(caught));
      setEvents(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleChrome
      title={consoleCopy.audit.title}
      back={{ href: routes.staffAdmin, label: consoleCopy.admin.backToSearch }}
    >
      <AdminNav />
      <form method="post" onSubmit={submit} noValidate className="console-form">
        <label htmlFor="audit-account">{consoleCopy.audit.accountLabel}</label>
        <input
          id="audit-account"
          name="accountId"
          type="text"
          autoComplete="off"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        />
        <label htmlFor="audit-since">{consoleCopy.audit.sinceLabel}</label>
        <input
          id="audit-since"
          name="since"
          type="date"
          value={since}
          onChange={(event) => setSince(event.target.value)}
        />
        <label htmlFor="audit-limit">{consoleCopy.audit.limitLabel}</label>
        <select
          id="audit-limit"
          name="limit"
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          {ROW_LIMITS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button className="button button--lime" disabled={busy}>
          {busy ? staffCopy.working : consoleCopy.audit.apply}
        </button>
      </form>

      {error ? <ConsoleNotice message={error} /> : null}
      {events && events.length === 0 ? <p>{consoleCopy.audit.empty}</p> : null}

      {events && events.length > 0 ? (
        <div className="console-table-scroll">
          <table className="console-table">
            <caption className="sr-only">{consoleCopy.audit.title}</caption>
            <thead>
              <tr>
                <th scope="col">{consoleCopy.audit.occurredAt}</th>
                <th scope="col">{consoleCopy.audit.actor}</th>
                <th scope="col">{consoleCopy.audit.sourceLabel}</th>
                <th scope="col">{consoleCopy.audit.action}</th>
                <th scope="col">{consoleCopy.audit.target}</th>
                <th scope="col">{consoleCopy.audit.detail}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((entry, index) => (
                <tr key={`${entry.occurredAt}-${index}`}>
                  <td>{entry.occurredAt}</td>
                  <td>
                    {entry.actorAccountId || consoleCopy.audit.unattributed}
                  </td>
                  <td>
                    {consoleCopy.audit.source[entry.actorSource] ??
                      entry.actorSource}
                  </td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.targetType}/{entry.targetId}
                  </td>
                  <td>{entry.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ConsoleChrome>
  );
}
