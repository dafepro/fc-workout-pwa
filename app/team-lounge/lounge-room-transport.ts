import type { RoomEnvelope } from "@canvas-physics/protocol";
import {
  WebSocketRoomTransport,
  type JoinDescriptor,
  type RealtimeCredentialProvider,
  type RoomTransport,
  type TransportStatus,
  type TransportTraffic,
  type WebSocketTransportOptions,
} from "@canvas-physics/client";

type TransportFactory = (options: WebSocketTransportOptions) => RoomTransport;
export type LoungeTransportConnectionState = "online" | "reconnecting";

const reconnectDelayMs = 1_000;

export function createPersistentLoungeTransport(
  credentialProvider: RealtimeCredentialProvider,
  onConnectionStateChange: (
    state: LoungeTransportConnectionState,
  ) => void = () => undefined,
  createTransport: TransportFactory = (options) =>
    new WebSocketRoomTransport(options),
): RoomTransport {
  let current: RoomTransport | undefined;
  let join: JoinDescriptor | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let opened = false;
  let connectionState: LoungeTransportConnectionState = "online";
  let status: TransportStatus = "idle";
  let detachCurrent = () => undefined;
  const messageHandlers = new Set<(message: RoomEnvelope) => void>();
  const statusHandlers = new Set<
    (next: TransportStatus, detail?: string) => void
  >();
  const priorTraffic: TransportTraffic = {
    inboundBytes: 0,
    outboundBytes: 0,
    inboundMessages: 0,
    outboundMessages: 0,
    droppedOutbound: 0,
  };

  const publishStatus = (next: TransportStatus, detail?: string) => {
    status = next;
    for (const handler of statusHandlers) handler(next, detail);
  };

  const publishConnectionState = (next: LoungeTransportConnectionState) => {
    if (connectionState === next) return;
    connectionState = next;
    onConnectionStateChange(next);
  };

  const retainTraffic = (traffic: TransportTraffic) => {
    priorTraffic.inboundBytes += traffic.inboundBytes;
    priorTraffic.outboundBytes += traffic.outboundBytes;
    priorTraffic.inboundMessages += traffic.inboundMessages;
    priorTraffic.outboundMessages += traffic.outboundMessages;
    priorTraffic.droppedOutbound += traffic.droppedOutbound;
  };

  const scheduleReplacement = () => {
    if (closed || retryTimer) return;
    status = "reconnecting";
    publishConnectionState("reconnecting");
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connectCurrent(false);
    }, reconnectDelayMs);
  };

  const connectCurrent = async (initial: boolean): Promise<void> => {
    if (!join || closed) return;
    if (current) {
      retainTraffic(current.traffic);
      detachCurrent();
      current.close();
    }
    const next = createTransport({
      credentialProvider,
      backoffMs: [250, 500, 1_000, 2_000, 4_000],
      maxReconnects: 20,
      maxPendingReliable: 256,
    });
    current = next;
    const unsubscribeMessage = next.onMessage((message) => {
      for (const handler of messageHandlers) handler(message);
    });
    const unsubscribeStatus = next.onStatus((nextStatus, detail) => {
      if (nextStatus === "open") {
        opened = true;
        publishConnectionState("online");
        publishStatus("open", detail);
        return;
      }
      if (opened && !closed) {
        // Preserve the local simulation role; the next open still forces a fresh authoritative JOIN.
        status = "reconnecting";
        publishConnectionState("reconnecting");
        if (nextStatus === "failed" || nextStatus === "closed") {
          scheduleReplacement();
        }
        return;
      }
      publishStatus(nextStatus, detail);
    });
    detachCurrent = () => {
      unsubscribeMessage();
      unsubscribeStatus();
      detachCurrent = () => undefined;
    };
    try {
      await next.connect(join);
    } catch (error) {
      if (opened && !closed) {
        scheduleReplacement();
        return;
      }
      if (initial) throw error;
    }
  };

  return {
    connect(nextJoin) {
      join = nextJoin;
      closed = false;
      return connectCurrent(true);
    },
    sendReliable(message) {
      if (current?.status === "open") current.sendReliable(message);
    },
    sendEphemeralReliable(message) {
      return current?.status === "open"
        ? (current.sendEphemeralReliable?.(message) ?? false)
        : false;
    },
    sendRealtime(message) {
      if (current?.status === "open") current.sendRealtime(message);
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    get status() {
      return status;
    },
    get traffic() {
      const active = current?.traffic;
      return {
        inboundBytes: priorTraffic.inboundBytes + (active?.inboundBytes ?? 0),
        outboundBytes:
          priorTraffic.outboundBytes + (active?.outboundBytes ?? 0),
        inboundMessages:
          priorTraffic.inboundMessages + (active?.inboundMessages ?? 0),
        outboundMessages:
          priorTraffic.outboundMessages + (active?.outboundMessages ?? 0),
        droppedOutbound:
          priorTraffic.droppedOutbound + (active?.droppedOutbound ?? 0),
      };
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      retryTimer = undefined;
      if (current) retainTraffic(current.traffic);
      detachCurrent();
      current?.close();
      current = undefined;
      publishStatus("closed");
    },
  };
}
