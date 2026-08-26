import { headers } from "next/headers";
import { devAccessEnabled } from "../api/backend";
import { signedInAs } from "../api/session-role";
import { LoginEntry } from "./LoginEntry";

export default async function LoginPage() {
  const requestHeaders = await headers();
  const existingSession = await signedInAs(requestHeaders.get("cookie") ?? "");
  return (
    <LoginEntry
      devAccess={devAccessEnabled()}
      existingSession={existingSession}
    />
  );
}
