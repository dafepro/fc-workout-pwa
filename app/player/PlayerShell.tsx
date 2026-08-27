"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { copy } from "../content/copy";
import { routes } from "../content/routes";
import { useAuth } from "../state/auth-context";

const SERVICE_WORKER_URL = "/sw.js?v=5";

const navigation = [
  { href: "/", label: copy.navigation.today, icon: "⌂" },
  { href: "/team", label: copy.navigation.team, icon: "●●" },
  { href: "/me", label: copy.navigation.me, icon: "◯" },
] as const;

export function PlayerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentPlayer: player } = useAuth();
  const focused = pathname === routes.playerAvatar;

  useEffect(() => {
    document.documentElement.dataset.appReady = "true";
    return () => {
      delete document.documentElement.dataset.appReady;
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const reloadForUpdate = () => hadController && window.location.reload();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      reloadForUpdate,
      { once: true },
    );
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        reloadForUpdate,
      );
  }, []);

  function navigationIcon(item: (typeof navigation)[number]) {
    if (item.href === "/me") {
      return (
        <span className="nav-user-avatar" aria-hidden="true">
          <PlayerAvatar player={player} size="small" emphasizeSelf={false} />
        </span>
      );
    }
    return <span aria-hidden="true">{item.icon}</span>;
  }

  const links = navigation.map((item) => {
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
  });

  return (
    <div className={`app-shell ${focused ? "app-shell--focused" : ""}`}>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={`${copy.brand} Today`}>
          <span className="brand__mark" aria-hidden="true">
            Z
          </span>
          <span>
            <strong>{copy.brand}</strong>
            <small>{copy.tagline}</small>
          </span>
        </Link>
        <nav className="navigation" aria-label="Primary navigation">
          {links}
        </nav>
        <div className="sidebar__safe-note">
          <span aria-hidden="true">◆</span>
          <p>{copy.safeSocial}</p>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      {!focused ? (
        <nav className="bottom-nav" aria-label="Primary navigation">
          {links}
        </nav>
      ) : null}
    </div>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
