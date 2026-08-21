"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { routes } from "../content/routes";
import { devAccessCopy } from "./copy";

export function DevAdminSignIn({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/staff/api/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("dev sign-in failed");
      router.replace(routes.staffAdmin);
    } catch {
      setError(devAccessCopy.adminError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button--lime" disabled={busy} onClick={signIn}>
        {busy ? devAccessCopy.signingIn : devAccessCopy.adminButton}
      </button>
    </>
  );
}
