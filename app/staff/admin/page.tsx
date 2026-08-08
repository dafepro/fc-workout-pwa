import { requireOperator } from "./guard";
import { AdminSearch } from "./AdminSearch";

export default async function AdminHomePage() {
  await requireOperator();
  return <AdminSearch />;
}
