import {
  backendOrResponse,
  callBackend,
  jsonBody,
  relay,
  sessionToCookie,
  unavailable,
} from "../upstream";

/**
 * F-S8, both steps. The setup token arrives from the URL fragment and is sent
 * only in this request body — never in a path, query string, or header.
 *
 * Step one exchanges the temporary password for the TOTP secret. Step two sets
 * the password, confirms the enrollment, and mints the first session, whose
 * token goes straight into the cookie.
 */
export async function POST(request: Request) {
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;

  if (typeof body.temporaryPassword === "string") {
    const upstream = await callBackend(baseURL, "/v1/auth/staff-setup", {
      method: "POST",
      body: {
        setupToken: body.setupToken,
        temporaryPassword: body.temporaryPassword,
      },
    });
    return upstream ? relay(upstream) : unavailable();
  }

  const upstream = await callBackend(baseURL, "/v1/auth/staff-setup", {
    method: "POST",
    body: {
      setupToken: body.setupToken,
      password: body.password,
      code: body.code,
    },
  });
  return upstream ? sessionToCookie(request, upstream) : unavailable();
}
