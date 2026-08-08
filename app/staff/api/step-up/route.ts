import { jsonError } from "../../../api/backend";
import { readStaffCookie } from "../staff-cookie";
import {
  backendOrResponse,
  callBackend,
  jsonBody,
  relay,
  unavailable,
} from "../upstream";

/** SEC-3 re-authentication. Mints no session: it only refreshes how recently
 * the existing one was fully authenticated. */
export async function POST(request: Request) {
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const token = readStaffCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  const body = await jsonBody(request);
  if (body instanceof Response) return body;

  const payload =
    typeof body.challenge === "string"
      ? { challenge: body.challenge, code: body.code }
      : { password: body.password };
  const upstream = await callBackend(
    baseURL,
    "/v1/auth/staff-sessions/step-up",
    { method: "POST", body: payload, token },
  );
  return upstream ? relay(upstream) : unavailable();
}
