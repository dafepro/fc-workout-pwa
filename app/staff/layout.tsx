import type { Metadata } from "next";

/**
 * The console is never a search result, and never previewed by a link unfurl.
 *
 * This mattered less when the Access gate covered all of /staff and kept
 * crawlers out as a side effect. It covers only /staff/admin now, so the coach
 * console, the sign-in form, and the setup page are publicly reachable and this
 * is what says otherwise, alongside the `robots.txt` entry that asks crawlers
 * not to fetch them at all. Neither is a security control.
 */
export const metadata: Metadata = {
  title: "Staff console",
  robots: { index: false, follow: false, nocache: true },
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
