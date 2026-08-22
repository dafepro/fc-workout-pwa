"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { copy } from "../content/copy";
import { useOptionalAuth } from "../state/auth-context";
import { useOptionalTeamCanvas } from "../team-canvas/state";
import { playerExperienceCopy } from "./content";

const SERVICE_WORKER_URL = "/sw.js?v=5";

const navigation = [
  { href: "/", label: playerExperienceCopy.navigation.today, icon: "⌂" },
  { href: "/team", label: playerExperienceCopy.navigation.team, icon: "●●" },
  { href: "/me", label: playerExperienceCopy.navigation.me, icon: "◯" },
] as const;

export function PlayerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useOptionalAuth();
  const canvas = useOptionalTeamCanvas();
  const teamLocked = canvas
    ? canvas.connectedStatus === "locked" ||
      (canvas.connectedStatus === "local" && !canvas.state.primaryComplete)
    : false;
  const focused = pathname === "/me/avatar";

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
      {
        once: true,
      },
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

  function icon(item: (typeof navigation)[number]) {
    if (item.href === "/me" && auth) {
      return (
        <span className="player-nav__avatar" aria-hidden="true">
          <PlayerAvatar
            player={auth.currentPlayer}
            size="small"
            emphasizeSelf={false}
          />
        </span>
      );
    }
    return <span aria-hidden="true">{item.icon}</span>;
  }

  const links = navigation.map((item) => {
    const active = isActivePath(pathname, item.href);
    const locked = item.href === "/team" && teamLocked;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? "is-active" : ""}
        aria-current={active ? "page" : undefined}
      >
        <span className="player-nav__icon">
          {icon(item)}
          {locked ? (
            <span className="player-nav__lock" aria-label="Locked">
              ◆
            </span>
          ) : null}
        </span>
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <div className={`player-shell${focused ? " player-shell--focused" : ""}`}>
      <aside className="player-sidebar">
        <Link
          className="player-brand"
          href="/"
          aria-label={`${copy.brand} Today`}
        >
          <span aria-hidden="true">Z</span>
          <strong>{copy.brand}</strong>
        </Link>
        <nav aria-label="Primary navigation (desktop)">{links}</nav>
        <p className="player-sidebar__note">
          Train privately. Show up together.
        </p>
      </aside>
      <main className="player-main">{children}</main>
      {!focused ? (
        <nav
          className="player-bottom-nav"
          aria-label={playerExperienceCopy.navigation.label}
        >
          {links}
        </nav>
      ) : null}
    </div>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
