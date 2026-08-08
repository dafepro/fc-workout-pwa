"use client";

import { consoleCopy } from "./copy";
import { ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { routes } from "../../content/routes";

/** Sign out is prominent on every console screen, and never hidden behind a
 * menu: the device is often borrowed (F-C11). */
export function ConsoleChrome({
  title,
  back,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="console">
      <header className="console__bar">
        <div>
          <p className="eyebrow">{consoleCopy.eyebrow}</p>
          <h1 className="console__title">{title}</h1>
        </div>
        <SignOutButton />
      </header>
      {back ? (
        <p className="console__back">
          <Link href={back.href}>{back.label}</Link>
        </p>
      ) : null}
      <main className="console__body">{children}</main>
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="button button--outline console__sign-out"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/staff/api/session", { method: "DELETE" });
        } finally {
          router.replace(routes.staffSignIn);
        }
      }}
    >
      {consoleCopy.signOut}
    </button>
  );
}

export function ConsoleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="console-card" aria-label={title}>
      <h2 className="console-card__title">{title}</h2>
      {children}
    </section>
  );
}

export function ConsoleNotice({ message }: { message: string }) {
  return (
    <p className="notice notice--error console__notice" role="alert">
      {message}
    </p>
  );
}
