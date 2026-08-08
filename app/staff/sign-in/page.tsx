import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routes } from "../../content/routes";
import { staffSessionFrom } from "../session";
import { StaffSignIn } from "./StaffSignIn";

export default async function StaffSignInPage() {
  const requestHeaders = await headers();
  const who = await staffSessionFrom(requestHeaders.get("cookie") ?? "");
  if (who) redirect(routes.staffConsoleHome);
  return <StaffSignIn />;
}
