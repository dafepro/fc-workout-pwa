import type { Metadata } from "next";

/** The console is never a search result, and never previewed by a link unfurl. */
export const metadata: Metadata = {
  title: "Staff console",
  robots: { index: false, follow: false },
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
