import {
  normalizeLoungeChatPackIDs,
  type LoungeChatPackID,
} from "./lounge-quick-phrases";

export const LOUNGE_CHAT_PACK_STORAGE_KEY = "zoomigo:lounge-chat-packs:v1";

export function loadLoungeChatPackIDs(storage: {
  getItem(key: string): string | null;
}): LoungeChatPackID[] {
  try {
    const stored = storage.getItem(LOUNGE_CHAT_PACK_STORAGE_KEY);
    return normalizeLoungeChatPackIDs(stored ? JSON.parse(stored) : undefined);
  } catch {
    return normalizeLoungeChatPackIDs(undefined);
  }
}

export function saveLoungeChatPackIDs(
  storage: { setItem(key: string, value: string): void },
  packIDs: readonly LoungeChatPackID[],
): void {
  try {
    storage.setItem(
      LOUNGE_CHAT_PACK_STORAGE_KEY,
      JSON.stringify(normalizeLoungeChatPackIDs(packIDs)),
    );
  } catch {
    // A blocked device store should not disable the in-room setting.
  }
}
