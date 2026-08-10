"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar } from "./Avatar";
import { copy } from "../content/copy";
import { useAuth } from "../state/auth-context";

const SERVICE_WORKER_URL = "/sw.js?v=4";

const navigation = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/team", label: "Team", icon: "●●" },
  { href: "/leaders", label: "Leaders", icon: "♜" },
  { href: "/me", label: "Me", icon: "◯" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentPlayer: player, avatarConfig } = useAuth();
  const logging = pathname === "/log";

  function navigationIcon(item: (typeof navigation)[number]) {
    if (item.href === "/me") {
      // The link already says "Me", so the avatar's own label would be a second
      // accessible name for the same target.
      return (
        <span className="nav-user-avatar" aria-hidden="true">
          <Avatar player={player} size="small" config={avatarConfig} />
        </span>
      );
    }
    return <span aria-hidden="true">{item.icon}</span>;
  }

  useEffect(() => {
    document.documentElement.dataset.appReady = "true";

    return () => {
      delete document.documentElement.dataset.appReady;
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const reloadForUpdate = () => {
        if (hadController) {
          window.location.reload();
        }
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        reloadForUpdate,
        { once: true },
      );
      navigator.serviceWorker
        .register(SERVICE_WORKER_URL, { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);

      return () => {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          reloadForUpdate,
        );
      };
    }
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={`${copy.brand} home`}>
          <span className="brand__mark" aria-hidden="true">
            Z
          </span>
          <span>
            <strong>{copy.brand}</strong>
            <small>{copy.tagline}</small>
          </span>
        </Link>
        <nav className="navigation" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {navigationIcon(item)}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar__safe-note">
          <span aria-hidden="true">◆</span>
          <p>{copy.safeSocial}</p>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <Link
        className={`training-fab ${logging ? "training-fab--close" : ""}`}
        href={logging ? "/" : "/log"}
        aria-label={logging ? "Close training entry" : "Record training"}
      >
        <span aria-hidden="true">{logging ? "−" : "+"}</span>
      </Link>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
            >
              {navigationIcon(item)}
              <small>{item.label}</small>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
