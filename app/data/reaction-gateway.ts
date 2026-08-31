import type {
  ReactionBadge,
  ReactionBadgePage,
  ReactionContext,
  ReactionType,
  SendReactionResult,
} from "../domain/types";

export interface SendReactionInput {
  recipientPlayerId: string;
  reactionType: ReactionType;
  context: ReactionContext;
}

export interface ReactionGateway {
  send(input: SendReactionInput): Promise<SendReactionResult>;
  listReceived(cursor?: string): Promise<ReactionBadgePage>;
}

export class ReactionGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const apiReactionType: Record<ReactionType, string> = {
  clap: "clap",
  fire: "fire",
  strong: "strong",
  hustle: "hustle",
  runner: "runner",
  wind: "wind",
  "robot-leg": "robot_leg",
  "do-it": "do_it",
};
const appReactionType: Record<string, ReactionType> = {
  clap: "clap",
  fire: "fire",
  strong: "strong",
  hustle: "hustle",
  runner: "runner",
  wind: "wind",
  robot_leg: "robot-leg",
  do_it: "do-it",
};

interface APIBadge extends Omit<ReactionBadge, "reactionType"> {
  reactionType: string;
}

class ConnectedReactionGateway implements ReactionGateway {
  async send(input: SendReactionInput): Promise<SendReactionResult> {
    const response = await fetch("/api/zoomigo/v1/reactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        recipientPlayerId: input.recipientPlayerId,
        reactionType: apiReactionType[input.reactionType],
        context: input.context,
      }),
    });
    const body = (await response.json()) as
      | SendReactionResult
      | { error?: { code?: string; message?: string } };
    if (!response.ok) {
      const error = "error" in body ? body.error : undefined;
      throw new ReactionGatewayError(
        error?.code ?? "reaction_failed",
        error?.message ?? "That cheer could not be sent.",
      );
    }
    return body as SendReactionResult;
  }

  async listReceived(cursor?: string): Promise<ReactionBadgePage> {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(
      `/api/zoomigo/v1/me/reaction-badges?${params.toString()}`,
    );
    if (!response.ok) {
      throw new ReactionGatewayError(
        "reaction_inbox_failed",
        "Your cheers could not be loaded.",
      );
    }
    const body = (await response.json()) as {
      items: APIBadge[];
      nextCursor: string | null;
    };
    return {
      items: body.items.map((badge) => ({
        ...badge,
        reactionType: appReactionType[badge.reactionType] ?? "clap",
      })),
      nextCursor: body.nextCursor,
    };
  }
}

export function createConnectedReactionGateway(): ReactionGateway {
  return new ConnectedReactionGateway();
}
