interface CoordinatorCallbacks {
  onOwnershipChange(owner: boolean): void;
  onInbound(payload: string): void;
  onOutbound(payload: string): void;
}

export interface TeamCanvasDeviceCoordinator {
  isOwner(): boolean;
  send(payload: string): void;
  broadcast(payload: string): void;
  close(): void;
}

type ChannelMessage =
  | { type: "hello"; sender: string }
  | { type: "lease"; owner: string; until: number }
  | { type: "outbound"; sender: string; payload: string }
  | { type: "inbound"; sender: string; payload: string };

const leaseMilliseconds = 3200;

export function createTeamCanvasDeviceCoordinator(
  teamID: string,
  callbacks: CoordinatorCallbacks,
): TeamCanvasDeviceCoordinator {
  if (typeof BroadcastChannel === "undefined") {
    queueMicrotask(() => callbacks.onOwnershipChange(true));
    return {
      isOwner: () => true,
      send: callbacks.onOutbound,
      broadcast: () => {},
      close: () => callbacks.onOwnershipChange(false),
    };
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const channel = new BroadcastChannel(`zoomigo-team-canvas:${teamID}`);
  let ownerID: string | null = null;
  let leaseUntil = 0;
  let owner = false;
  let closed = false;
  let roomReadyPayload: string | null = null;

  const setOwner = (next: boolean) => {
    if (owner === next) return;
    owner = next;
    callbacks.onOwnershipChange(next);
  };
  const announce = () => {
    leaseUntil = Date.now() + leaseMilliseconds;
    ownerID = id;
    channel.postMessage({ type: "lease", owner: id, until: leaseUntil });
  };
  const claimIfVacant = () => {
    if (closed || leaseUntil > Date.now()) return;
    ownerID = id;
    setOwner(true);
    announce();
  };

  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "hello") {
      if (owner) {
        announce();
        if (roomReadyPayload) {
          channel.postMessage({
            type: "inbound",
            sender: id,
            payload: roomReadyPayload,
          });
        }
      }
      return;
    }
    if (message.type === "lease") {
      if (
        typeof message.owner !== "string" ||
        !Number.isFinite(message.until) ||
        message.until <= Date.now()
      ) {
        return;
      }
      if (owner && message.owner !== id) {
        if (id < message.owner) {
          announce();
          return;
        }
        setOwner(false);
      }
      ownerID = message.owner;
      leaseUntil = message.until;
      return;
    }
    if (
      message.type === "outbound" &&
      owner &&
      message.sender !== id &&
      typeof message.payload === "string"
    ) {
      callbacks.onOutbound(message.payload);
    } else if (
      message.type === "inbound" &&
      !owner &&
      message.sender === ownerID &&
      typeof message.payload === "string"
    ) {
      callbacks.onInbound(message.payload);
    }
  };

  channel.postMessage({ type: "hello", sender: id });
  const claimTimer = setTimeout(claimIfVacant, 120);
  const heartbeat = setInterval(() => {
    if (closed) return;
    if (owner) announce();
    else if (leaseUntil <= Date.now()) claimIfVacant();
  }, 1000);

  return {
    isOwner: () => owner,
    send(payload) {
      if (owner) callbacks.onOutbound(payload);
      else channel.postMessage({ type: "outbound", sender: id, payload });
    },
    broadcast(payload) {
      if (!owner) return;
      try {
        const message = JSON.parse(payload) as { type?: unknown };
        if (message.type === "room.ready") roomReadyPayload = payload;
      } catch {
        // Only a valid versioned room message is useful for late tabs.
      }
      channel.postMessage({ type: "inbound", sender: id, payload });
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(claimTimer);
      clearInterval(heartbeat);
      setOwner(false);
      channel.close();
    },
  };
}
