"use client";

import { consoleCopy, staffCopy } from "./copy";

import { FormEvent, useCallback, useRef, useState } from "react";
import { ConsoleError, consoleAuthRequest, messageFor } from "./api";
import { CodeInput } from "./CodeInput";

type Action = () => Promise<void>;

// Hold the refused action so reauthentication preserves the operator's intent.
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
  const [challenge, setChallenge] = useState("");
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!challenge) {
        const outcome = await consoleAuthRequest<{
          confirmed?: boolean;
          challenge?: string;
        }>("step-up", { method: "POST", body: { password } });
        if (outcome?.confirmed === true && outcome.challenge !== undefined) {
          throw new Error(consoleCopy.stepUp.failed);
        }
        if (outcome?.confirmed !== true) {
          if (typeof outcome?.challenge !== "string" || !outcome.challenge) {
            throw new Error(consoleCopy.stepUp.failed);
          }
          setChallenge(outcome.challenge);
          setPassword("");
          return;
        }
      } else {
        await consoleAuthRequest<void>("step-up", {
          method: "POST",
          body: { challenge, code },
        });
      }
      setPassword("");
      setCode("");
      setChallenge("");
      await onConfirmed();
    } catch (caught) {
      // A submitted code consumes its challenge even when verification fails.
      setChallenge("");
      setPassword("");
      setCode("");
      setError(messageFor(caught));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="console-card console-card--step-up">
      <h2 className="console-card__title">{consoleCopy.stepUp.title}</h2>
      <p>{challenge ? staffCopy.codeIntro : consoleCopy.stepUp.body}</p>
      <form method="post" onSubmit={submit} noValidate className="console-form">
        {challenge ? (
          <CodeInput id="step-up-code" value={code} onChange={setCode} />
        ) : (
          <>
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
          </>
        )}
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="console-actions">
          <button className="button button--lime" disabled={busy}>
            {busy
              ? staffCopy.working
              : challenge
                ? consoleCopy.stepUp.confirm
                : staffCopy.continue}
          </button>
          <button
            type="button"
            className="button button--outline"
            onClick={() => {
              setPassword("");
              setCode("");
              setChallenge("");
              onCancel();
            }}
            disabled={busy}
          >
            {consoleCopy.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
