"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "../content/copy";

export default function LoginPage() {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [pin, setPIN] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [status, setStatus] = useState<"ready" | "submitting">("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const credentialValue = fragment.get("credential") ?? "";
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    const updateCredential = window.setTimeout(() => {
      setCredential(credentialValue);
      document.documentElement.dataset.appReady = "true";
    }, 0);
    return () => {
      window.clearTimeout(updateCredential);
      delete document.documentElement.dataset.appReady;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!credential) {
      setError(copy.auth.missingQR);
      return;
    }
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
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(body.error?.message ?? "Sign in could not be completed.");
        return;
      }
      router.replace("/");
    } catch {
      setError("Sign in is temporarily unavailable.");
    } finally {
      setStatus("ready");
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand__mark" aria-hidden="true">
          Z
        </div>
        <p className="eyebrow">{copy.brand}</p>
        <h1 id="login-title">{copy.auth.loginTitle}</h1>
        <p>{copy.auth.loginIntro}</p>
        <form
          onSubmit={submit}
          noValidate
          data-credential-ready={credential ? "true" : "false"}
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
      </section>
    </main>
  );
}
