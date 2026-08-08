import { requireOperator } from "../guard";
import { AuditScreen } from "./AuditScreen";

export default async function AuditPage() {
  await requireOperator();
  return <AuditScreen />;
}
