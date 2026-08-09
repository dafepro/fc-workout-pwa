import { requireOperator } from "./guard";

/**
 * A second check over the operator segment, not the only one. A layout is not
 * re-run when Next moves between sibling routes that share it, so a layout
 * guard alone would hold on a cold load of /staff/admin/audit and not on a
 * click through to it from /staff/admin/clubs. Every page keeps its own
 * `requireOperator`, and `guards.test.ts` fails if one loses it.
 *
 * This still earns its place: it covers a new page added to the segment in the
 * window before anyone notices the missing call, and the API answers 403 on its
 * own regardless of what the browser renders (REQ-301, SEC-5).
 *
 * Access covers this path at the edge as well (REQ-402), which is the layer a
 * coach never reaches. It does not cover the coach console at /staff.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOperator();
  return <>{children}</>;
}
