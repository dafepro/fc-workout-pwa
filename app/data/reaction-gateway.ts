import type {
  ReactionBadge,
  ReactionBadgePage,
  ReactionContext,
  ReactionType,
  SendReactionResult,
} from "../domain/types";
import { copy } from "../content/copy";

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
  sentAt: string;
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

class LocalReactionGateway implements ReactionGateway {
  async send(input: SendReactionInput): Promise<SendReactionResult> {
    const now = new Date();
    const windowStart = now.getTime() - 30 * 60 * 1000;
    const current = readLocalReactions();
    const sentInWindow = current.filter(
      (reaction) =>
        reaction.recipientPlayerId === input.recipientPlayerId &&
        new Date(reaction.sentAt).getTime() > windowStart,
    ).length;
    if (sentInWindow >= 5) {
      throw new ReactionGatewayError(
        "reaction_rate_limit_reached",
        copy.cheers.limitReached,
      );
    }
    const reaction: LocalSentReaction = {
      id: crypto.randomUUID(),
      recipientPlayerId: input.recipientPlayerId,
      sentAt: now.toISOString(),
    };
    window.localStorage.setItem(
      LOCAL_REACTIONS_KEY,
      JSON.stringify([reaction, ...current]),
    );
    return {
      id: reaction.id,
      remainingForRecipientWindow: 4 - sentInWindow,
    };
  }

  async listReceived(): Promise<ReactionBadgePage> {
    return {
      items: [
        {
          id: "local-badge-liam-challenge",
          sender: { id: "liam", displayName: "Liam J." },
          reactionType: "strong",
          emoji: "💪",
          message:
            "Liam J. cheered your Hill Sprints challenge and sent you 💪.",
          context: {
            type: "challenge",
            teamId: "team-hill-striders",
            assignmentId: "prototype-hill-sprints",
            activityName: "Hill Sprints",
          },
          createdAt: new Date().toISOString(),
          readAt: null,
        },
        {
          id: "local-badge-zoe-team",
          sender: { id: "zoe", displayName: "Zoe T." },
          reactionType: "clap",
          emoji: "👏",
          message: "Zoe T. cheered your weekly Team progress and sent you 👏.",
          context: {
            type: "team_progress",
            teamId: "team-hill-striders",
            period: "weekly",
          },
          createdAt: new Date(Date.now() - 60_000).toISOString(),
          readAt: null,
        },
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
      ],
      nextCursor: null,
    };
  }
}

export function createReactionGateway(connected = false): ReactionGateway {
  return connected ? new HTTPReactionGateway() : new LocalReactionGateway();
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
