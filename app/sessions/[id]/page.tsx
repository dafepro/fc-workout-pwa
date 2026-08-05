"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SessionFeelings } from "../../components/SessionFeelings";
import { activities, CURRENT_PLAYER_ID } from "../../data/mockData";
import { canDeleteEntry } from "../../domain/rules";
import { useTraining } from "../../state/training-context";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { entries, deleteEntry } = useTraining();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const entry = entries.find(
    (item) => item.id === params.id && item.playerId === CURRENT_PLAYER_ID,
  );

  if (!entry) {
    return (
      <div className="page page--session-detail">
        <section className="card empty-session">
          <h1>Session not found</h1>
          <p>It may have been deleted or saved on another device.</p>
          <Link className="button button--outline" href="/">
            Back to My Sessions
          </Link>
        </section>
      </div>
    );
  }

  const activity = activities.find((item) => item.id === entry.activityId)!;
  const deletable = canDeleteEntry(entry, CURRENT_PLAYER_ID);
  const occurredAt = new Date(entry.occurredAt);

  function removeSession() {
    deleteEntry(entry!.id);
    router.replace("/");
  }

  return (
    <div className="page page--session-detail">
      <header className="session-detail-header">
        <Link href="/">← My Sessions</Link>
        <h1>{activity.name}</h1>
      </header>

      <section
        className={`card session-detail-card history-row--${activity.id}`}
      >
        <span className="session-detail-card__icon" aria-hidden="true">
          {activity.icon}
        </span>
        <dl>
          <div>
            <dt>Completed</dt>
            <dd>
              {entry.value} {entry.unit}
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              {occurredAt.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {occurredAt.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </dd>
          </div>
        </dl>
        <section className="session-detail-feelings">
          <h2>How this session felt</h2>
          <SessionFeelings
            effort={entry.effortLevel}
            exhaustion={entry.exhaustionLevel}
            detailed
          />
        </section>
      </section>

      <section className="card delete-session-card">
        <div>
          <h2>Delete session</h2>
          <p>
            {deletable
              ? "Delete is available for 24 hours after saving. This cannot be undone."
              : "The 24-hour deletion window has closed."}
          </p>
        </div>
        {deletable && !confirmingDelete ? (
          <button
            className="button button--danger-outline"
            type="button"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete session
          </button>
        ) : null}
        {deletable && confirmingDelete ? (
          <div
            className="delete-session-card__confirm"
            role="group"
            aria-label="Confirm deletion"
          >
            <strong>Delete this session?</strong>
            <button
              className="button button--danger"
              type="button"
              onClick={removeSession}
            >
              Yes, delete
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
