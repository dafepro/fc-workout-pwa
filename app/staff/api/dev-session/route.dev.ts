import { devAccessEnabled } from "../../../api/backend";
import {
  backendOrResponse,
  callBackend,
  jsonBody,
  sessionToCookie,
  unavailable,
} from "../upstream";

export async function POST(request: Request) {
  if (!devAccessEnabled()) return new Response(null, { status: 404 });
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const upstream = await callBackend(baseURL, "/__dev/staff-session", {
    method: "POST",
    body: { email: body.email, password: body.password },
  });
  return upstream ? sessionToCookie(request, upstream) : unavailable();
}
