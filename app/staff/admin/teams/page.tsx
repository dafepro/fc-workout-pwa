import { requireOperator } from "../guard";
import { TeamsScreen } from "./TeamsScreen";

export default async function TeamsPage() {
  await requireOperator();
  return <TeamsScreen />;
}
