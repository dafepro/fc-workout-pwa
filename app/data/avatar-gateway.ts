import { normalizeAvatar } from "../avatar/config";
import type { AvatarConfiguration } from "../avatar/types";

export interface AvatarGateway {
  load(): Promise<AvatarConfiguration>;
  save(config: AvatarConfiguration): Promise<AvatarConfiguration>;
}

export class AvatarGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const LOCAL_AVATAR_KEY = "zoomigo-avatar";

class HTTPAvatarGateway implements AvatarGateway {
  constructor(private readonly fromSession: AvatarConfiguration) {}

  /** GET /v1/auth/session already carried the configuration, so this keeps the
   * interface uniform without a second round trip. */
  async load(): Promise<AvatarConfiguration> {
    return this.fromSession;
  }

  async save(config: AvatarConfiguration): Promise<AvatarConfiguration> {
    const response = await fetch("/api/zoomigo/v1/me/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configuration: normalizeAvatar(config) }),
    });
    await throwForError(response);
    const body = (await response.json()) as {
      configuration?: AvatarConfiguration;
    };
    return body.configuration ?? {};
  }
}

class LocalAvatarGateway implements AvatarGateway {
  async load(): Promise<AvatarConfiguration> {
    try {
      const stored = window.localStorage.getItem(LOCAL_AVATAR_KEY);
      return stored ? (JSON.parse(stored) as AvatarConfiguration) : {};
    } catch {
      return {};
    }
  }

  async save(config: AvatarConfiguration): Promise<AvatarConfiguration> {
    const normalized = normalizeAvatar(config);
    try {
      window.localStorage.setItem(LOCAL_AVATAR_KEY, JSON.stringify(normalized));
    } catch {
      // The provider still updates when browser storage is unavailable.
    }
    return normalized;
  }
}

export function createAvatarGateway(
  connected: boolean,
  fromSession: AvatarConfiguration = {},
): AvatarGateway {
  return connected
    ? new HTTPAvatarGateway(fromSession)
    : new LocalAvatarGateway();
}

async function throwForError(response: Response): Promise<void> {
  if (response.ok) return;
  let code = "avatar_save_failed";
  let message = "Your look could not be saved.";
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // The safe fallback is used when an intermediary returns a non-JSON error.
  }
  throw new AvatarGatewayError(code, message);
}
