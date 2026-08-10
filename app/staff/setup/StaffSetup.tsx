"use client";

import { staffCopy } from "../console/copy";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy } from "../../content/copy";
import { routes } from "../../content/routes";
import { consoleAuthRequest, messageFor } from "../console/api";

const MINIMUM_PASSWORD_LENGTH = 12;

interface Enrollment {
  email: string;
  secret: string;
  provisioningUri: string;
  /** Absent when the server could not encode it; the setup key is the fallback. */
  qrPngBase64?: string;
}

type Step =
  | { name: "reading" }
  | { name: "missing" }
  | { name: "password" }
  | { name: "enroll"; enrollment: Enrollment }
  | { name: "recovery"; codes: string[] };

/**
 * F-S8. The setup token arrives in the query, because a fragment does not
 * survive the Cloudflare Access one-time-PIN redirect that guards /staff. It is
 * stripped from history on load, so it leaves the back button and any `Referer`
 * even though the edge has already logged it.
 *
 * A fragment is not read. Every link that carried one has been spent or
 * reissued, and accepting both forms only invited someone to reintroduce the
 * fragment as the primary and rediscover that it cannot cross the gate.
 */
export function StaffSetup() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [step, setStep] = useState<Step>({ name: "reading" });

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const setupToken = query.get("setup") ?? "";
    query.delete("setup");
    const rest = query.toString();
    history.replaceState(
      null,
      "",
      `${location.pathname}${rest ? `?${rest}` : ""}`,
    );
    const settle = window.setTimeout(() => {
      setToken(setupToken);
      setStep(setupToken ? { name: "password" } : { name: "missing" });
    }, 0);
    return () => window.clearTimeout(settle);
  }, []);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="staff-setup-title">
        <p className="eyebrow">{copy.brand}</p>
        <h1 id="staff-setup-title">{staffCopy.setup.title}</h1>
        {step.name === "reading" ? null : step.name === "missing" ? (
          <p className="login-help" role="alert">
            {staffCopy.setup.missingToken}
          </p>
        ) : step.name === "password" ? (
          <TemporaryPasswordStep
            token={token}
            onEnrolled={(enrollment) => setStep({ name: "enroll", enrollment })}
          />
        ) : step.name === "enroll" ? (
          <EnrollStep
            token={token}
            enrollment={step.enrollment}
            onComplete={(codes) => setStep({ name: "recovery", codes })}
          />
        ) : (
          <RecoveryStep
            codes={step.codes}
            onContinue={() => router.replace(routes.staffConsoleHome)}
          />
        )}
        <p className="login-staff">
          <Link href={routes.staffSignIn}>{staffCopy.signInTitle}</Link>
        </p>
      </section>
    </main>
  );
}

function TemporaryPasswordStep({
  token,
  onEnrolled,
}: {
  token: string;
  onEnrolled: (enrollment: Enrollment) => void;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onEnrolled(
        await consoleAuthRequest<Enrollment>("setup", {
          method: "POST",
          body: { setupToken: token, temporaryPassword },
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p>{staffCopy.setup.intro}</p>
      <form
        method="post"
        onSubmit={submit}
        noValidate
        data-step="temporary-password"
      >
        <label htmlFor="temporary-password">
          {staffCopy.setup.temporaryPasswordLabel}
        </label>
        <input
          id="temporary-password"
          name="temporaryPassword"
          type="password"
          autoComplete="one-time-code"
          autoFocus
          value={temporaryPassword}
          onChange={(event) => setTemporaryPassword(event.target.value)}
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button--lime" disabled={busy}>
          {busy ? staffCopy.working : staffCopy.continue}
        </button>
      </form>
    </>
  );
}

function EnrollStep({
  token,
  enrollment,
  onComplete,
}: {
  token: string;
  enrollment: Enrollment;
  onComplete: (codes: string[]) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(staffCopy.setup.passwordTooShort);
      return;
    }
    if (password !== confirmation) {
      setError(staffCopy.setup.passwordMismatch);
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(staffCopy.setup.codeRule);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await consoleAuthRequest<{ recoveryCodes?: string[] }>(
        "setup",
        { method: "POST", body: { setupToken: token, password, code } },
      );
      onComplete(result?.recoveryCodes ?? []);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>{staffCopy.setup.enrollTitle}</h2>
      <p className="login-help">{staffCopy.setup.enrollIntro}</p>
      {/* Rendered from the response bytes, as the player QR is: the page adds
          no QR dependency, and a data URL must not be routed through the image
          optimizer. Absent when the encoding failed, which is why the manual
          fallback below is always present rather than conditional on it. */}
      {enrollment.qrPngBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="setup-qr"
          src={`data:image/png;base64,${enrollment.qrPngBase64}`}
          alt={staffCopy.setup.qrAlt}
          width={512}
          height={512}
        />
      ) : null}
      <details className="setup-manual">
        <summary>{staffCopy.setup.manualTitle}</summary>
        <p className="console-hint">{staffCopy.setup.manualIntro}</p>
        <p>
          <a href={enrollment.provisioningUri}>{staffCopy.setup.uriLink}</a>
        </p>
        <dl className="console-facts console-facts--light">
          <dt>{staffCopy.setup.accountLabel}</dt>
          <dd>{enrollment.email}</dd>
          <dt>{staffCopy.setup.secretLabel}</dt>
          <dd className="console-facts__code">{enrollment.secret}</dd>
        </dl>
      </details>
      <form method="post" onSubmit={submit} noValidate data-step="enroll">
        <label htmlFor="new-password">{staffCopy.setup.newPasswordLabel}</label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          aria-describedby="password-rule"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p id="password-rule" className="console-hint">
          {staffCopy.setup.passwordRule}
        </p>
        <label htmlFor="confirm-password">
          {staffCopy.setup.confirmPasswordLabel}
        </label>
        <input
          id="confirm-password"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
        <label htmlFor="setup-code">{staffCopy.codeLabel}</label>
        <input
          id="setup-code"
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
        <button className="button button--lime" disabled={busy}>
          {busy ? staffCopy.working : staffCopy.setup.finish}
        </button>
      </form>
    </>
  );
}

function RecoveryStep({
  codes,
  onContinue,
}: {
  codes: string[];
  onContinue: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <>
      <h2>{staffCopy.setup.recoveryTitle}</h2>
      <p className="console-warning">{staffCopy.setup.recoveryBody}</p>
      <ul className="console-codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <label className="login-remember">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        {staffCopy.setup.recoveryAcknowledge}
      </label>
      <button
        type="button"
        className="button button--lime button--wide"
        disabled={!acknowledged}
        onClick={onContinue}
      >
        {staffCopy.setup.recoveryContinue}
      </button>
    </>
  );
}
