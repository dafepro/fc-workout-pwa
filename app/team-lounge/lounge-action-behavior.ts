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
    if (
      event.type !== "owner.action" ||
      event.action !== "zoomigo.emote" ||
      !isEmotePayload(event.payload)
    ) {
      return { state: state as LoungeActionState, commands: [] };
    }
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
  },
};

function isEmotePayload(value: unknown): value is { emote: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { emote?: unknown }).emote === "string"
  );
}
