"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { copy } from "../content/copy";

const navigation = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/team", label: "Team", icon: "●●" },
  { href: "/leaders", label: "Leaders", icon: "♜" },
  { href: "/me", label: "Me", icon: "◯" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="StrideCrew home">
          <span className="brand__mark" aria-hidden="true">
            S
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
                <span aria-hidden="true">{item.icon}</span>
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
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.label}</small>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
