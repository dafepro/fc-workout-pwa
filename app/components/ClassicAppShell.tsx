"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { copy } from "../content/copy";
import { useAuth } from "../state/auth-context";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";
import { routes } from "../content/routes";

const SERVICE_WORKER_URL = "/sw.js?v=5";

const navigation = [
  { href: "/classic-alpha", label: "Home", icon: "⌂" },
  { href: "/classic-alpha/team", label: "Team", icon: "●●" },
  { href: "/classic-alpha/leaders", label: "Leaders", icon: "♜" },
  { href: "/classic-alpha/me", label: "Me", icon: "◯" },
];

export function ClassicAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentPlayer: player } = useAuth();
  const analytics = useAnalytics();
  const logging = pathname === "/log";
  const focused = pathname === routes.playerAvatar;

  function navigationIcon(item: (typeof navigation)[number]) {
    if (item.href === "/classic-alpha/me") {
      // The link already says "Me", so the avatar's own label would be a second
      // accessible name for the same target.
      return (
        <span className="nav-user-avatar" aria-hidden="true">
          <PlayerAvatar player={player} size="small" emphasizeSelf={false} />
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
    <div className={`app-shell ${focused ? "app-shell--focused" : ""}`}>
      <aside className="sidebar">
        <Link
          className="brand"
          href="/classic-alpha"
          aria-label={`${copy.brand} Classic Alpha home`}
        >
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
            const active = isActivePath(pathname, item.href);
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
      {!focused ? (
        <>
          <Link
            className={`training-fab ${logging ? "training-fab--close" : ""}`}
            href={logging ? "/classic-alpha" : "/log"}
            aria-label={logging ? "Close training entry" : "Record training"}
            onClick={() => {
              if (!logging) {
                analytics.track("training_entry_started", {
                  source: "fab",
                  defaulted_activity: true,
                });
              }
            }}
          >
            <span aria-hidden="true">{logging ? "−" : "+"}</span>
          </Link>
          <nav className="bottom-nav" aria-label="Primary navigation">
            {navigation.map((item) => {
              const active = isActivePath(pathname, item.href);
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
        </>
      ) : null}
    </div>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href === "/classic-alpha/me" && pathname.startsWith("/me/"))
  );
}
