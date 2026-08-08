"use client";

import { consoleCopy } from "../console/copy";
import Link from "next/link";
import { routes } from "../../content/routes";

export function AdminNav() {
  return (
    <nav className="console-nav" aria-label={consoleCopy.admin.title}>
      <Link href={routes.staffAdmin}>{consoleCopy.admin.searchAction}</Link>
      <Link href={routes.staffAdminClubs}>{consoleCopy.admin.clubs}</Link>
      <Link href={routes.staffAdminTeams}>{consoleCopy.admin.teams}</Link>
      <Link href={routes.staffAdminAccounts}>{consoleCopy.admin.accounts}</Link>
      <Link href={routes.staffAdminAudit}>{consoleCopy.admin.audit}</Link>
    </nav>
  );
}
