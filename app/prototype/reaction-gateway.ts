import { copy } from "../content/copy";
import type { ReactionBadgePage, SendReactionResult } from "../domain/types";
import {
  ReactionGatewayError,
  type ReactionGateway,
  type SendReactionInput,
} from "../data/reaction-gateway";

const LOCAL_REACTIONS_KEY = "zoomigo-reaction-gateway-v1";

interface LocalSentReaction {
  id: string;
  recipientPlayerId: string;
  sentAt: string;
}

export function createUnhostedPrototypeReactionGateway(): ReactionGateway {
  return new UnhostedPrototypeReactionGateway();
}

class UnhostedPrototypeReactionGateway implements ReactionGateway {
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
