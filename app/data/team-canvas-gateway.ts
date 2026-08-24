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
import {
  parseTeamCanvasPieceFrame,
  parseTeamCanvasPhysicsFrame,
  type TeamCanvasPieceFrame,
  type TeamCanvasPhysicsFrame,
} from "../team-canvas/physics";
import {
  createTeamCanvasDeviceCoordinator,
  type TeamCanvasDeviceCoordinator,
} from "../team-canvas/realtime/coordinator";

export interface TeamCanvasSettings {
  backgroundAssetId: string;
  backgroundColor: string;
  textColor: string;
  textSize: number;
  textStyle: string;
  stampChoices: string[];
  developerStampLimit: number;
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
  physics: {
    v: 1;
    sceneId: TeamCanvasPhysicsFrame["sceneId"];
    sequence: number;
  };
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
  recordRest(plan: { planId: string; dayIndex: number }): Promise<void>;
  moveAvatar(position: BoardPosition): Promise<BoardPosition>;
  createPiece(assetID: string): Promise<ProjectedBoardPiece>;
  updatePiece(
    pieceID: string,
    transform: BoardTransform,
  ): Promise<ProjectedBoardPiece>;
  deletePiece(pieceID: string): Promise<void>;
  saveSettings(settings: TeamCanvasSettings): Promise<TeamCanvasSettings>;
  subscribe(handlers: {
    onChange(): void;
    onPhysics(frame: TeamCanvasPhysicsFrame): void;
    onPiece(frame: TeamCanvasPieceFrame): void;
  }): () => void;
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
  private socket: WebSocket | null = null;
  private movementSequence = 0;
  private physicsWorker: Worker | null = null;
  private socketPlayerID: string | null = null;
  private deviceCoordinator: TeamCanvasDeviceCoordinator | null = null;

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

  async recordRest(plan: { planId: string; dayIndex: number }): Promise<void> {
    await this.request("/rest", {
      method: "POST",
      body: JSON.stringify(plan),
    });
  }

  async moveAvatar(position: BoardPosition): Promise<BoardPosition> {
    if (this.socket?.readyState === 1 || this.deviceCoordinator) {
      if (this.socketPlayerID) {
        this.physicsWorker?.postMessage({
          type: "avatar",
          playerId: this.socketPlayerID,
          position,
          at: performance.now(),
        });
      }
      this.sendRealtime(
        JSON.stringify({
          v: 1,
          type: "avatar.target",
          messageId: `move-${Date.now().toString(36)}-${++this.movementSequence}`,
          position,
        }),
      );
      return position;
    }
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
        developerStampLimit: settings.developerStampLimit,
      }),
    });
    return (await response.json()) as TeamCanvasSettings;
  }

  subscribe(handlers: {
    onChange(): void;
    onPhysics(frame: TeamCanvasPhysicsFrame): void;
    onPiece(frame: TeamCanvasPieceFrame): void;
  }): () => void {
    let stopped = false;
    let events: EventSource | null = null;
    let visibilityHandler: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let presenceTimer: ReturnType<typeof setInterval> | null = null;
    let pendingSocketPayload: string | null = null;
    const startEventsFallback = () => {
      if (stopped || events || typeof EventSource === "undefined") return;
      events = new EventSource(`${this.root}/events`);
      events.addEventListener("ready", handlers.onChange);
      events.addEventListener("canvas", handlers.onChange);
      events.addEventListener("physics", (event) => {
        if (!(event instanceof MessageEvent)) return;
        const frame = parseTeamCanvasPhysicsFrame(String(event.data));
        if (frame) handlers.onPhysics(frame);
      });
      events.addEventListener("piece", (event) => {
        if (!(event instanceof MessageEvent)) return;
        const frame = parseTeamCanvasPieceFrame(String(event.data));
        if (frame) handlers.onPiece(frame);
      });
    };
    const processRealtimeMessage = (encoded: string) => {
      if (encoded.length > 72 * 1024) return;
      let message: {
        v?: unknown;
        type?: unknown;
        frame?: unknown;
        playerId?: unknown;
        host?: unknown;
        position?: unknown;
      };
      try {
        message = JSON.parse(encoded) as typeof message;
      } catch {
        return;
      }
      if (message.v !== 1 || typeof message.type !== "string") return;
      if (message.type === "room.ready" || message.type === "physics.frame") {
        const frame = parseTeamCanvasPhysicsFrame(
          JSON.stringify(message.frame),
        );
        if (!frame) return;
        if (message.type === "room.ready") {
          this.socketPlayerID =
            typeof message.playerId === "string" ? message.playerId : null;
          this.startPhysicsWorker(
            frame,
            message.host === true &&
              (this.deviceCoordinator?.isOwner() ?? true),
            handlers.onPhysics,
          );
        } else if (this.physicsWorker) {
          this.physicsWorker.postMessage({ type: "reconcile", frame });
        } else {
          this.startPhysicsWorker(frame, false, handlers.onPhysics);
        }
      } else if (message.type === "piece.changed") {
        const frame = parseTeamCanvasPieceFrame(JSON.stringify(message.frame));
        if (frame) {
          handlers.onPiece(frame);
          this.physicsWorker?.postMessage({
            type: "piece.transform",
            id: frame.id,
            transform: {
              x: frame.x,
              y: frame.y,
              size: frame.size,
              rotation: frame.rotation,
            },
          });
        }
      } else if (message.type === "canvas.changed") {
        handlers.onChange();
      } else if (
        message.type === "avatar.input" &&
        typeof message.playerId === "string" &&
        message.position &&
        typeof message.position === "object"
      ) {
        this.physicsWorker?.postMessage({
          type: "avatar",
          playerId: message.playerId,
          position: message.position,
          at: performance.now(),
        });
      } else if (message.type === "host.granted") {
        this.physicsWorker?.postMessage({
          type: "host",
          host: this.deviceCoordinator?.isOwner() ?? true,
        });
      } else if (message.type === "host.revoked") {
        this.physicsWorker?.postMessage({ type: "host", host: false });
      }
    };
    const startSocket = async () => {
      if (stopped || !this.deviceCoordinator?.isOwner() || this.socket) return;
      try {
        const response = await this.request("/socket-ticket", {
          method: "POST",
          body: "{}",
        });
        const ticket = (await response.json()) as {
          ticket?: string;
          socketUrl?: string;
        };
        if (!ticket.ticket || !ticket.socketUrl || stopped)
          throw new Error("The live canvas ticket was incomplete.");
        const socket = new WebSocket(ticket.socketUrl, [
          "zoomigo.team-canvas.v1",
          `ticket.${ticket.ticket}`,
        ]);
        this.socket = socket;
        visibilityHandler = () => {
          if (socket.readyState !== 1) return;
          socket.send(
            JSON.stringify({
              v: 1,
              type: "presence.visible",
              messageId: `presence-${Date.now().toString(36)}`,
              visible: document.visibilityState === "visible",
            }),
          );
        };
        socket.onopen = () => {
          visibilityHandler?.();
          presenceTimer = setInterval(() => visibilityHandler?.(), 1000);
          if (pendingSocketPayload) {
            socket.send(pendingSocketPayload);
            pendingSocketPayload = null;
          }
        };
        document.addEventListener("visibilitychange", visibilityHandler);
        socket.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          this.deviceCoordinator?.broadcast(event.data);
          processRealtimeMessage(event.data);
        };
        socket.onclose = () => {
          if (presenceTimer) clearInterval(presenceTimer);
          presenceTimer = null;
          if (this.socket === socket) this.socket = null;
          if (!stopped && this.deviceCoordinator?.isOwner()) {
            reconnectTimer = setTimeout(() => void startSocket(), 350);
          }
        };
        socket.onerror = () => socket.close();
      } catch {
        if (this.deviceCoordinator?.isOwner()) startEventsFallback();
      }
    };
    this.deviceCoordinator = createTeamCanvasDeviceCoordinator(this.root, {
      onOwnershipChange: (owner) => {
        if (owner) void startSocket();
        else if (this.socket) {
          const socket = this.socket;
          this.socket = null;
          socket.close();
          this.physicsWorker?.postMessage({ type: "host", host: false });
        }
      },
      onInbound: processRealtimeMessage,
      onOutbound: (payload) => {
        if (this.socket?.readyState === 1) this.socket.send(payload);
        else pendingSocketPayload = payload;
      },
    });
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (presenceTimer) clearInterval(presenceTimer);
      events?.close();
      if (visibilityHandler)
        document.removeEventListener("visibilitychange", visibilityHandler);
      this.socket?.close();
      this.socket = null;
      this.deviceCoordinator?.close();
      this.deviceCoordinator = null;
      this.physicsWorker?.terminate();
      this.physicsWorker = null;
      this.socketPlayerID = null;
    };
  }

  private startPhysicsWorker(
    frame: TeamCanvasPhysicsFrame,
    host: boolean,
    onPhysics: (frame: TeamCanvasPhysicsFrame) => void,
  ) {
    this.physicsWorker?.terminate();
    if (typeof Worker === "undefined") {
      onPhysics(frame);
      return;
    }
    const worker = new Worker(
      new URL("../team-canvas/worker/team-canvas.worker.ts", import.meta.url),
      { type: "module", name: "team-canvas-physics" },
    );
    this.physicsWorker = worker;
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: unknown; frame?: unknown };
      const parsed = parseTeamCanvasPhysicsFrame(JSON.stringify(message.frame));
      if (!parsed) return;
      if (message.type === "frame") onPhysics(parsed);
      if (message.type === "host.snapshot") {
        this.sendRealtime(
          JSON.stringify({
            v: 1,
            type: "physics.snapshot",
            messageId: `snapshot-${parsed.sequence}`,
            frame: parsed,
          }),
        );
      }
    };
    worker.postMessage({ type: "init", frame, host });
  }

  private sendRealtime(payload: string) {
    if (this.socket?.readyState === 1) this.socket.send(payload);
    else this.deviceCoordinator?.send(payload);
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
