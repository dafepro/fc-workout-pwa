import { redirect } from "next/navigation";
import { devAccessEnabled } from "../../api/backend";
import { staffSetupDestination } from "../sign-in/destination";
import { StaffSetup } from "./StaffSetup";

export default function StaffSetupPage() {
  const destination = staffSetupDestination(devAccessEnabled());
  if (destination) redirect(destination);
  return <StaffSetup />;
}
