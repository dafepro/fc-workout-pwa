import { ConsolidatedToday } from "./player/components/ConsolidatedToday";
import { TransientQueryToast } from "./components/TransientQueryToast";
import { copy } from "./content/copy";

export default function TodayPage() {
  return (
    <>
      <TransientQueryToast
        parameter="saved"
        value="1"
        message={copy.saveSuccess}
      />
      <ConsolidatedToday />
    </>
  );
}
