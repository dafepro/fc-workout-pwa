"use client";

import { staffCopy } from "../console/copy";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { routes } from "../../content/routes";
import { LoginMasthead } from "../../components/LoginMasthead";
import { useFragmentSecret } from "../../components/useFragmentSecret";
import { consoleAuthRequest, messageFor } from "../console/api";
import { CodeInput } from "../console/CodeInput";

const MINIMUM_PASSWORD_LENGTH = 12;

interface Enrollment {
  email: string;
  secret: string;
  provisioningUri: string;
  /** Absent when the server could not encode it; the setup key is the fallback. */
  qrPngBase64?: string;
}

// Only the steps the invitee advances into. Which of the first two the page
// opens on is not state: it is whether the fragment held a token.
type Step =
  | { name: "enroll"; enrollment: Enrollment }
  | { name: "recovery"; codes: string[] };

/**
 * F-S8. The setup token arrives in the fragment and is read by
 * `useFragmentSecret`, which is also how the player QR credential arrives; the
 * reasoning for the fragment, and for refusing the query, lives there. A link
 * issued in the old query form has to be reissued with `reset-staff-credential`.
 */
export function StaffSetup() {
  const router = useRouter();
  const { secret: token, settled } = useFragmentSecret("setup");
  const [step, setStep] = useState<Step | null>(null);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="staff-setup-title">
        <LoginMasthead />
        <h1 id="staff-setup-title">{staffCopy.setup.title}</h1>
        {step?.name === "enroll" ? (
          <EnrollStep
            token={token}
            enrollment={step.enrollment}
            onComplete={(codes) => setStep({ name: "recovery", codes })}
          />
        ) : step?.name === "recovery" ? (
          <RecoveryStep
            codes={step.codes}
            onContinue={() => router.replace(routes.staffConsoleHome)}
          />
        ) : !settled ? null : token ? (
          <TemporaryPasswordStep
            token={token}
            onEnrolled={(enrollment) => setStep({ name: "enroll", enrollment })}
          />
        ) : (
          <p className="login-help" role="alert">
            {staffCopy.setup.missingToken}
          </p>
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
        <CodeInput id="setup-code" value={code} onChange={setCode} />
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
