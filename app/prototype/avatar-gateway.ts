import { normalizeAvatar } from "../avatar/config";
import type { AvatarConfiguration } from "../avatar/types";
import type { AvatarGateway } from "../data/avatar-gateway";

const LOCAL_AVATAR_KEY = "zoomigo-avatar";

export function createUnhostedPrototypeAvatarGateway(): AvatarGateway {
  return new UnhostedPrototypeAvatarGateway();
}

class UnhostedPrototypeAvatarGateway implements AvatarGateway {
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
