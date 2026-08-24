import { consoleCopy } from "./copy";
import { gatewayFor } from "../api/console-routes";
import { devAccessCopy } from "../../dev-access/copy";

export class ConsoleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConsoleError";
  }

  /** SEC-3: the session is valid but its last full authentication is stale. */
  get needsStepUp(): boolean {
    return this.status === 401 && this.code === "step_up_required";
  }

  get signedOut(): boolean {
    return this.status === 401 && !this.needsStepUp;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  formData?: FormData;
}

export async function consoleFormRequest<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const gateway = gatewayFor("POST", path);
  return send<T>(`${gateway}${path}`, { method: "POST", formData });
}

/**
 * Every console request goes through a same-origin gateway under `/staff/`,
 * which is the only thing that holds the session token. Which of the two it
 * goes through is a property of the path, looked up rather than passed in: a
 * screen shared by the coach and operator consoles calls the same function
 * either way, and no caller has to know its own role to reach the right gate.
 */
export async function consoleRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const gateway = gatewayFor(options.method ?? "GET", path);
  return send<T>(`${gateway}${path}${queryString(options.query)}`, options);
}

/** The auth routes sit beside the gateway rather than behind it, because they
 * are the ones that write and clear the session cookie. */
export async function consoleAuthRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return send<T>(`/staff/api/${path}`, options);
}

async function send<T>(url: string, options: RequestOptions): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers:
        options.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        options.formData ??
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  } catch {
    throw new ConsoleError(0, "unreachable", consoleCopy.loadFailed);
  }
  if (response.redirected && /\/_dev-gate(?:\?|$)/.test(response.url)) {
    throw new ConsoleError(
      401,
      "preview_access_expired",
      devAccessCopy.sessionExpired,
    );
  }
  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }
  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ConsoleError(
      response.status,
      error?.code ?? "error",
      error?.message ?? consoleCopy.actionFailed,
    );
  }
  return parsed as T;
}

function queryString(query: RequestOptions["query"]): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export function messageFor(error: unknown): string {
  return error instanceof ConsoleError
    ? error.message
    : consoleCopy.actionFailed;
}
