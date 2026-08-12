"use client";

import { staffCopy } from "../console/copy";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { routes } from "../../content/routes";
import { useHydrated } from "../../components/useHydrated";
import { LoginMasthead } from "../../components/LoginMasthead";
import { ConsoleError, consoleAuthRequest } from "../console/api";
import { CodeInput } from "../console/CodeInput";

type Step =
  | { name: "password" }
  | { name: "code"; challenge: string }
  | { name: "setup" };

interface PasswordResult {
  challenge?: string;
  expiresAt?: string;
  setupRequired?: boolean;
}

/**
 * F-S6. Email and password, then TOTP on a second step. Every failure says the
 * same thing, so that trying addresses never reveals which staff accounts
 * exist (REQ-106), and there is deliberately no remembered-device control.
 */
export function StaffSignIn() {
  const router = useRouter();
  // Both steps carry a secret, so neither may reach the browser's own submit
  // path: that is a GET, and a GET puts every named field in the URL.
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(caught: unknown) {
    const throttled =
      caught instanceof ConsoleError &&
      (caught.status === 429 || caught.code === "login_temporarily_locked");
    setError(throttled ? staffCopy.tooManyAttempts : staffCopy.signInFailed);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await consoleAuthRequest<PasswordResult>("session", {
        method: "POST",
        body: { email, password },
      });
      if (result?.setupRequired) {
        setStep({ name: "setup" });
        return;
      }
      if (!result?.challenge) {
        setError(staffCopy.signInFailed);
        return;
      }
      setPassword("");
      setStep({ name: "code", challenge: result.challenge });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (step.name !== "code") return;
    setBusy(true);
    setError("");
    try {
      await consoleAuthRequest<unknown>("session", {
        method: "POST",
        body: { challenge: step.challenge, code },
      });
      router.replace(routes.staffConsoleHome);
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="staff-sign-in-title">
        <LoginMasthead />
        {/* F-S7: the heading names who the page is for, so a player who lands
            here can see at once that it is the wrong door. */}
        <h1 id="staff-sign-in-title">{staffCopy.signInTitle}</h1>
        <p>{staffCopy.signInIntro}</p>

        {step.name === "setup" ? (
          <>
            <h2>{staffCopy.setupRequiredTitle}</h2>
            <p className="login-help">{staffCopy.setupRequiredBody}</p>
          </>
        ) : step.name === "code" ? (
          <>
            <h2>{staffCopy.codeTitle}</h2>
            <p className="login-help">{staffCopy.codeIntro}</p>
            <form
              method="post"
              onSubmit={submitCode}
              noValidate
              data-step="code"
            >
              <CodeInput
                id="staff-code"
                value={code}
                onChange={setCode}
                autoFocus
              />
              {error ? (
                <p className="notice notice--error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className="button button--lime"
                disabled={busy || !hydrated}
              >
                {busy ? staffCopy.working : staffCopy.signIn}
              </button>
              <button
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  setError("");
                  setStep({ name: "password" });
                }}
              >
                {staffCopy.back}
              </button>
            </form>
          </>
        ) : (
          <form
            method="post"
            onSubmit={submitPassword}
            noValidate
            data-step="password"
          >
            <label htmlFor="staff-email">{staffCopy.emailLabel}</label>
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="staff-password">{staffCopy.passwordLabel}</label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="button button--lime"
              disabled={busy || !hydrated}
            >
              {busy ? staffCopy.working : staffCopy.continue}
            </button>
          </form>
        )}

        <p className="login-staff">
          <Link href={routes.playerSignIn}>{staffCopy.playerLink}</Link>
        </p>
      </section>
    </main>
  );
}
