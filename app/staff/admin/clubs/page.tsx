import { requireOperator } from "../guard";
import { ClubsScreen } from "./ClubsScreen";

export default async function ClubsPage() {
  await requireOperator();
  return <ClubsScreen />;
}
