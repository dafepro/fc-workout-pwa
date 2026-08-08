"use client";

import { staffCopy } from "./copy";

import { FormEvent, useCallback, useState } from "react";
import { copy } from "../../content/copy";
import { ConsoleError, consoleAuthRequest, messageFor } from "./api";

type Action = () => Promise<void>;

/**
 * SEC-3. Deactivating an account and resetting staff credentials need a fresh
 * full authentication. Rather than asking for it up front, the console runs the
 * action, and only when the API answers `step_up_required` does it ask for a
 * password and a code — then retries the very action that was refused, so the
 * operator never has to remember what they were doing.
 */
export function useStepUp() {
  const [pending, setPending] = useState<{ action: Action } | null>(null);

  const run = useCallback(async (action: Action) => {
    try {
      await action();
    } catch (error) {
      if (error instanceof ConsoleError && error.needsStepUp) {
        setPending({ action });
        return;
      }
      throw error;
    }
  }, []);

  const cancel = useCallback(() => setPending(null), []);

  const complete = useCallback(async () => {
    const held = pending;
    setPending(null);
    if (held) await held.action();
  }, [pending]);

  return { run, pending: pending !== null, cancel, complete };
}

export function StepUpForm({
  onCancel,
  onConfirmed,
}: {
  onCancel: () => void;
  onConfirmed: () => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { challenge } = await consoleAuthRequest<{ challenge: string }>(
        "step-up",
        { method: "POST", body: { password } },
      );
      await consoleAuthRequest<void>("step-up", {
        method: "POST",
        body: { challenge, code },
      });
      await onConfirmed();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="console-card console-card--step-up">
      <h2 className="console-card__title">{copy.console.stepUp.title}</h2>
      <p>{copy.console.stepUp.body}</p>
      <form onSubmit={submit} noValidate className="console-form">
        <label htmlFor="step-up-password">{staffCopy.passwordLabel}</label>
        <input
          id="step-up-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label htmlFor="step-up-code">{staffCopy.codeLabel}</label>
        <input
          id="step-up-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="console-actions">
          <button className="button button--lime" disabled={busy}>
            {busy ? staffCopy.working : copy.console.stepUp.confirm}
          </button>
          <button
            type="button"
            className="button button--outline"
            onClick={onCancel}
            disabled={busy}
          >
            {copy.console.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
