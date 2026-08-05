"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionFeelings } from "../../components/SessionFeelings";
import { activities, CURRENT_PLAYER_ID } from "../../data/mockData";
import { canDeleteEntry } from "../../domain/rules";
import type { TrainingEntry } from "../../domain/types";
import { useTraining } from "../../state/training-context";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { deleteEntry, getEntry } = useTraining();
  const [entry, setEntry] = useState<TrainingEntry | null | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    void getEntry(params.id).then(
      (loaded) => {
        if (active) setEntry(loaded);
      },
      () => {
        if (active) setEntry(null);
      },
    );
    return () => {
      active = false;
    };
  }, [getEntry, params.id]);

  if (entry === undefined) {
    return (
      <div className="page page--session-detail">
        <section className="card empty-session" aria-live="polite">
          <h1>Loading session…</h1>
        </section>
      </div>
    );
  }

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

  async function removeSession() {
    if (!entry || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteEntry(entry.id);
      router.replace("/");
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "That session could not be deleted.",
      );
      setDeleting(false);
    }
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
              disabled={deleting}
              onClick={removeSession}
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {deleteError ? (
          <p className="notice notice--error" role="alert">
            {deleteError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
