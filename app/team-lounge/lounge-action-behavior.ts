import {
  type BehaviorEvent,
  type BehaviorResult,
  type ItemBehavior,
} from "@canvas-physics/core";

type LoungeActionState = Record<string, never>;

export const LoungeActionBehavior: ItemBehavior<
  LoungeActionState,
  LoungeActionState
> = {
  behaviorType: "zoomigoLoungeActions",
  stateVersion: 1,
  subscribes: ["owner.action"],
  initialState: () => ({}),
  onEvent(
    _context,
    _config,
    state,
    event: BehaviorEvent,
  ): BehaviorResult<LoungeActionState> {
    if (event.type !== "owner.action") {
      return { state: state as LoungeActionState, commands: [] };
    }
    if (event.action === "zoomigo.emote" && isEmotePayload(event.payload)) {
      return {
        state: state as LoungeActionState,
        commands: [
          {
            type: "emitEffect",
            effect: "zoomigo.emote",
            params: { playerId: event.userId, emote: event.payload.emote },
          },
        ],
      };
    }
    if (
      event.action === "zoomigo.quickPhrase" &&
      isQuickPhrasePayload(event.payload)
    ) {
      return {
        state: state as LoungeActionState,
        commands: [
          {
            type: "emitEffect",
            effect: "zoomigo.quickPhrase",
            params: { playerId: event.userId, phrase: event.payload.phrase },
          },
        ],
      };
    }
    return {
      state: state as LoungeActionState,
      commands: [],
    };
  },
};

function isEmotePayload(value: unknown): value is { emote: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as { emote?: unknown }).emote === "string"
  );
}

function isQuickPhrasePayload(value: unknown): value is { phrase: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as { phrase?: unknown }).phrase === "string"
  );
}
