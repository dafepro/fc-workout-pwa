import { requireOperator } from "../guard";
import { AccountsScreen } from "./AccountsScreen";

export default async function AccountsPage() {
  await requireOperator();
  return <AccountsScreen />;
}
