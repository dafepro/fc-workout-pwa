import type {
  ReactionBadge,
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
  listReceived(): Promise<ReactionBadge[]>;
}

export class ReactionGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const LOCAL_REACTIONS_KEY = "zoomigo-reaction-gateway-v1";
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

interface LocalSentReaction {
  id: string;
  recipientPlayerId: string;
  sentOn: string;
}

interface APIBadge extends Omit<ReactionBadge, "reactionType"> {
  reactionType: string;
}

class HTTPReactionGateway implements ReactionGateway {
  async send(input: SendReactionInput): Promise<SendReactionResult> {
    const response = await fetch("/api/zoomigo/v1/reactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        recipientPlayerId: toAPIPlayerID(input.recipientPlayerId),
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

  async listReceived(): Promise<ReactionBadge[]> {
    const response = await fetch("/api/zoomigo/v1/me/reaction-badges");
    if (!response.ok) {
      throw new ReactionGatewayError(
        "reaction_inbox_failed",
        "Your cheers could not be loaded.",
      );
    }
    const body = (await response.json()) as { items: APIBadge[] };
    return body.items.map((badge) => ({
      ...badge,
      reactionType: appReactionType[badge.reactionType] ?? "clap",
    }));
  }
}

class LocalReactionGateway implements ReactionGateway {
  async send(input: SendReactionInput): Promise<SendReactionResult> {
    const today = localDay(new Date());
    const current = readLocalReactions();
    const sentToday = current.filter(
      (reaction) =>
        reaction.recipientPlayerId === input.recipientPlayerId &&
        reaction.sentOn === today,
    ).length;
    if (sentToday >= 5) {
      throw new ReactionGatewayError(
        "reaction_daily_limit_reached",
        "You have sent today’s maximum to this teammate.",
      );
    }
    const reaction: LocalSentReaction = {
      id: crypto.randomUUID(),
      recipientPlayerId: input.recipientPlayerId,
      sentOn: today,
    };
    window.localStorage.setItem(
      LOCAL_REACTIONS_KEY,
      JSON.stringify([reaction, ...current]),
    );
    return {
      id: reaction.id,
      remainingForRecipientToday: 4 - sentToday,
    };
  }

  async listReceived(): Promise<ReactionBadge[]> {
    return [
      {
        id: "local-badge-ava-effort",
        sender: { id: "ava", displayName: "Ava R." },
        reactionType: "fire",
        emoji: "🔥",
        message:
          "Ava R. saw you on the Weekly Effort leaderboard and sent you 🔥.",
        context: {
          type: "leaderboard",
          teamId: "team-hill-striders",
          period: "weekly",
          metric: "effort",
        },
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ];
  }
}

export function createReactionGateway(connected = false): ReactionGateway {
  return connected ? new HTTPReactionGateway() : new LocalReactionGateway();
}

function toAPIPlayerID(playerID: string): string {
  return playerID.startsWith("player-") ? playerID : `player-${playerID}`;
}

function localDay(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readLocalReactions(): LocalSentReaction[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(LOCAL_REACTIONS_KEY) ?? "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
