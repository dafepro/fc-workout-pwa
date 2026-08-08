"use client";

import { staffCopy } from "../../console/copy";

import { FormEvent, useState } from "react";
import { copy } from "../../../content/copy";
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
      title={copy.console.audit.title}
      back={{ href: routes.staffAdmin, label: copy.console.admin.backToSearch }}
    >
      <AdminNav />
      <form onSubmit={submit} noValidate className="console-form">
        <label htmlFor="audit-account">{copy.console.audit.accountLabel}</label>
        <input
          id="audit-account"
          name="accountId"
          type="text"
          autoComplete="off"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        />
        <label htmlFor="audit-since">{copy.console.audit.sinceLabel}</label>
        <input
          id="audit-since"
          name="since"
          type="date"
          value={since}
          onChange={(event) => setSince(event.target.value)}
        />
        <label htmlFor="audit-limit">{copy.console.audit.limitLabel}</label>
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
          {busy ? staffCopy.working : copy.console.audit.apply}
        </button>
      </form>

      {error ? <ConsoleNotice message={error} /> : null}
      {events && events.length === 0 ? <p>{copy.console.audit.empty}</p> : null}

      {events && events.length > 0 ? (
        <div className="console-table-scroll">
          <table className="console-table">
            <caption className="sr-only">{copy.console.audit.title}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.console.audit.occurredAt}</th>
                <th scope="col">{copy.console.audit.actor}</th>
                <th scope="col">{copy.console.audit.action}</th>
                <th scope="col">{copy.console.audit.target}</th>
                <th scope="col">{copy.console.audit.detail}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((entry, index) => (
                <tr key={`${entry.occurredAt}-${index}`}>
                  <td>{entry.occurredAt}</td>
                  <td>{entry.actorAccountId}</td>
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
