import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { devAccessEnabled } from "../../api/backend";
import { staffSessionFrom } from "../session";
import { staffSignInDestination } from "./destination";
import { StaffSignIn } from "./StaffSignIn";

export default async function StaffSignInPage() {
  const requestHeaders = await headers();
  const who = await staffSessionFrom(requestHeaders.get("cookie") ?? "");
  const destination = staffSignInDestination(devAccessEnabled(), Boolean(who));
  if (destination) redirect(destination);
  return <StaffSignIn />;
}
