import { requireOperator } from "../guard";
import { RewardReportsScreen } from "./RewardReportsScreen";

export default async function RewardReportsPage() {
  await requireOperator();
  return <RewardReportsScreen />;
}
