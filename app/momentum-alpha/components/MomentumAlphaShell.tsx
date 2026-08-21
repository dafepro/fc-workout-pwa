"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { momentumAlphaCopy } from "../content";
import { momentumAlphaRoutes } from "../routes";

const navigation = [
  {
    href: momentumAlphaRoutes.today,
    label: momentumAlphaCopy.nav.today,
    icon: "⌁",
  },
  {
    href: momentumAlphaRoutes.team,
    label: momentumAlphaCopy.nav.team,
    icon: "◌",
  },
  {
    href: momentumAlphaRoutes.me,
    label: momentumAlphaCopy.nav.me,
    icon: "○",
  },
];

export function MomentumAlphaShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="momentum-alpha">
      <header className="ma-header">
        <Link href={momentumAlphaRoutes.today} className="ma-brand">
          <span className="ma-brand__mark" aria-hidden="true">
            Z
          </span>
          <span>
            <strong>{momentumAlphaCopy.brand}</strong>
            <small>{momentumAlphaCopy.edition}</small>
          </span>
        </Link>
        <span className="ma-header__status">
          {momentumAlphaCopy.alternateView}
        </span>
      </header>

      <main className="ma-main">{children}</main>

      <nav className="ma-nav" aria-label={momentumAlphaCopy.nav.label}>
        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== momentumAlphaRoutes.today &&
              pathname.startsWith(`${item.href}/`));
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
