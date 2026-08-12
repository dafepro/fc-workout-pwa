"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy } from "../content/copy";
import { LoginMasthead } from "../components/LoginMasthead";
import { useFragmentSecret } from "../components/useFragmentSecret";
import { routes } from "../content/routes";

export function LoginEntry() {
  const router = useRouter();
  const { secret: credential, settled } = useFragmentSecret("credential");

  // Playwright waits on this rather than on any one element, so it must appear
  // only once the fragment has been read and the page is what it will stay.
  useEffect(() => {
    if (!settled) return;
    document.documentElement.dataset.appReady = "true";
    return () => {
      delete document.documentElement.dataset.appReady;
    };
  }, [settled]);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <LoginMasthead />
        {credential ? (
          <PINForm
            credential={credential}
            onSignedIn={() => router.replace(routes.playerHome)}
          />
        ) : (
          <ScanPrompt busy={!settled} />
        )}
      </section>
    </main>
  );
}

/** F-S2: no input, because no input could work. */
function ScanPrompt({ busy }: { busy: boolean }) {
  return (
    <>
      <h1 id="login-title">{copy.auth.scanTitle}</h1>
      <p>{copy.auth.scanBody}</p>
      <p className="login-help">{copy.auth.help}</p>
      {busy ? null : (
        <p className="login-staff">
          <Link href={routes.staffSignIn}>{copy.auth.staffLink}</Link>
        </p>
      )}
    </>
  );
}

function PINForm({
  credential,
  onSignedIn,
}: {
  credential: string;
  onSignedIn: () => void;
}) {
  const [pin, setPIN] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [status, setStatus] = useState<"ready" | "submitting">("ready");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError(copy.auth.invalidPIN);
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, pin, rememberDevice }),
      });
      if (!response.ok) {
        // Unknown, malformed, revoked, and wrong-PIN all say the same thing, so
        // that a guesser learns nothing about which codes exist (REQ-105).
        setError(copy.auth.signInFailed);
        return;
      }
      onSignedIn();
    } catch {
      setError(copy.auth.signInFailed);
    } finally {
      setStatus("ready");
    }
  }

  return (
    <>
      <h1 id="login-title">{copy.auth.loginTitle}</h1>
      <p>{copy.auth.loginIntro}</p>
      <form
        method="post"
        onSubmit={submit}
        noValidate
        data-credential-ready="true"
      >
        <label htmlFor="player-pin">{copy.auth.pinLabel}</label>
        <input
          id="player-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{4}"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={(event) => setPIN(event.target.value.replace(/\D/g, ""))}
          required
        />
        <label className="login-remember">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          {copy.auth.remember}
        </label>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--lime"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="login-help">{copy.auth.help}</p>
    </>
  );
}
