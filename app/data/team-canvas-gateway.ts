import { playerColor } from "../avatar/color";
import type { AvatarConfiguration } from "../avatar/types";
import type { Player, SocialTeam } from "../domain/types";
import { teamCanvasStamp } from "../team-canvas/catalog";
import type {
  BoardPosition,
  BoardTransform,
  ProjectedBoardPiece,
  StampAsset,
} from "../team-canvas/model";

export interface TeamCanvasSettings {
  backgroundAssetId: string;
  backgroundColor: string;
  textColor: string;
  textSize: number;
  textStyle: string;
  stampChoices: string[];
  revision: number;
}

export interface TeamCanvasMember {
  player: Player;
  avatarConfiguration: AvatarConfiguration;
  position: BoardPosition;
  starDayKeys: string[];
}

export interface ConnectedTeamCanvasProjection {
  team: SocialTeam;
  dayKey: string;
  weekKey: string;
  settings: TeamCanvasSettings;
  stampChoices: StampAsset[];
  members: TeamCanvasMember[];
  pieces: ProjectedBoardPiece[];
  avatarPosition: BoardPosition;
  availableRewards: number;
  cooldownComplete: boolean;
  developerControlsEnabled: boolean;
}

export interface TeamCanvasGateway {
  load(): Promise<ConnectedTeamCanvasProjection>;
  recordRest(): Promise<void>;
  moveAvatar(position: BoardPosition): Promise<BoardPosition>;
  createPiece(assetID: string): Promise<ProjectedBoardPiece>;
  updatePiece(
    pieceID: string,
    transform: BoardTransform,
  ): Promise<ProjectedBoardPiece>;
  deletePiece(pieceID: string): Promise<void>;
  saveSettings(settings: TeamCanvasSettings): Promise<TeamCanvasSettings>;
  subscribe(onChange: () => void): () => void;
}

export class TeamCanvasGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface APITeamCanvasProjection
  extends Omit<
    ConnectedTeamCanvasProjection,
    "members" | "pieces" | "stampChoices"
  > {
  stampChoices: string[];
  members: {
    playerId: string;
    firstName: string;
    lastInitial: string;
    avatarConfiguration: AvatarConfiguration;
    position: BoardPosition;
    starDayKeys: string[];
  }[];
  pieces: (Omit<ProjectedBoardPiece, "asset"> & { assetId: string })[];
}

class HTTPTeamCanvasGateway implements TeamCanvasGateway {
  private readonly root: string;

  constructor(teamID: string) {
    this.root = `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/canvas`;
  }

  async load(): Promise<ConnectedTeamCanvasProjection> {
    const response = await this.request("");
    const body = (await response.json()) as APITeamCanvasProjection;
    return {
      ...body,
      stampChoices: body.stampChoices.map(teamCanvasStamp),
      members: body.members.map((member) => ({
        player: {
          id: member.playerId,
          firstName: member.firstName,
          lastInitial: `${member.lastInitial.replace(/\.$/, "")}.`,
          initials:
            `${member.firstName[0] ?? ""}${member.lastInitial[0] ?? ""}`.toUpperCase(),
          avatarColor: playerColor(member.playerId),
          weeklySessions: 0,
          effortPoints: 0,
          currentStreak: 0,
          consistency: member.starDayKeys.length,
        },
        avatarConfiguration: member.avatarConfiguration,
        position: member.position,
        starDayKeys: member.starDayKeys,
      })),
      pieces: body.pieces.map(({ assetId, ...piece }) => ({
        ...piece,
        asset: teamCanvasStamp(assetId),
      })),
    };
  }

  async recordRest(): Promise<void> {
    await this.request("/rest", { method: "POST", body: "{}" });
  }

  async moveAvatar(position: BoardPosition): Promise<BoardPosition> {
    const response = await this.request("/avatar", {
      method: "PUT",
      body: JSON.stringify(position),
    });
    return (await response.json()) as BoardPosition;
  }

  async createPiece(assetID: string): Promise<ProjectedBoardPiece> {
    const response = await this.request("/pieces", {
      method: "POST",
      body: JSON.stringify({ assetId: assetID }),
    });
    return pieceFromAPI(
      (await response.json()) as Omit<ProjectedBoardPiece, "asset"> & {
        assetId: string;
      },
    );
  }

  async updatePiece(
    pieceID: string,
    transform: BoardTransform,
  ): Promise<ProjectedBoardPiece> {
    const response = await this.request(
      `/pieces/${encodeURIComponent(pieceID)}`,
      { method: "PUT", body: JSON.stringify(transform) },
    );
    return pieceFromAPI(
      (await response.json()) as Omit<ProjectedBoardPiece, "asset"> & {
        assetId: string;
      },
    );
  }

  async deletePiece(pieceID: string): Promise<void> {
    await this.request(`/pieces/${encodeURIComponent(pieceID)}`, {
      method: "DELETE",
    });
  }

  async saveSettings(
    settings: TeamCanvasSettings,
  ): Promise<TeamCanvasSettings> {
    const response = await this.request("/dev-settings", {
      method: "PUT",
      body: JSON.stringify({
        backgroundAssetId: settings.backgroundAssetId,
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        textSize: settings.textSize,
        textStyle: settings.textStyle,
        stampChoices: settings.stampChoices,
      }),
    });
    return (await response.json()) as TeamCanvasSettings;
  }

  subscribe(onChange: () => void): () => void {
    const events = new EventSource(`${this.root}/events`);
    events.addEventListener("canvas", onChange);
    return () => events.close();
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.root}${path}`, {
      ...init,
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (response.ok) return response;
    let code = "team_canvas_failed";
    let message = "The team canvas could not be loaded.";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // The predefined fallback is safe when an intermediary returns HTML.
    }
    throw new TeamCanvasGatewayError(code, message);
  }
}

export function createTeamCanvasGateway(teamID: string): TeamCanvasGateway {
  return new HTTPTeamCanvasGateway(teamID);
}

function pieceFromAPI(
  piece: Omit<ProjectedBoardPiece, "asset"> & { assetId: string },
): ProjectedBoardPiece {
  const { assetId, ...rest } = piece;
  return { ...rest, asset: teamCanvasStamp(assetId) };
}
