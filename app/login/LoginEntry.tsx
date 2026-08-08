"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy } from "../content/copy";
import { routes } from "../content/routes";

type Entry =
  | { state: "reading" }
  | { state: "scan" }
  | { state: "credential"; credential: string };

export function LoginEntry() {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry>({ state: "reading" });

  // The QR value arrives only in the fragment, which is never sent to a server,
  // never logged, and never in a Referer. It is stripped from history before
  // anything else runs so a back button or a shared screen cannot leak it.
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const credential = fragment.get("credential") ?? "";
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    const settle = window.setTimeout(() => {
      setEntry(
        credential ? { state: "credential", credential } : { state: "scan" },
      );
      document.documentElement.dataset.appReady = "true";
    }, 0);
    return () => {
      window.clearTimeout(settle);
      delete document.documentElement.dataset.appReady;
    };
  }, []);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand__mark" aria-hidden="true">
          Z
        </div>
        <p className="eyebrow">{copy.brand}</p>
        {entry.state === "credential" ? (
          <PINForm
            credential={entry.credential}
            onSignedIn={() => router.replace(routes.playerHome)}
          />
        ) : (
          <ScanPrompt busy={entry.state === "reading"} />
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
      <form onSubmit={submit} noValidate data-credential-ready="true">
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
