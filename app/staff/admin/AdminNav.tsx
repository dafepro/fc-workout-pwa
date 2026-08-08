"use client";

import Link from "next/link";
import { copy } from "../../content/copy";
import { routes } from "../../content/routes";

export function AdminNav() {
  return (
    <nav className="console-nav" aria-label={copy.console.admin.title}>
      <Link href={routes.staffAdmin}>{copy.console.admin.searchAction}</Link>
      <Link href={routes.staffAdminClubs}>{copy.console.admin.clubs}</Link>
      <Link href={routes.staffAdminTeams}>{copy.console.admin.teams}</Link>
      <Link href={routes.staffAdminAccounts}>
        {copy.console.admin.accounts}
      </Link>
      <Link href={routes.staffAdminAudit}>{copy.console.admin.audit}</Link>
    </nav>
  );
}
