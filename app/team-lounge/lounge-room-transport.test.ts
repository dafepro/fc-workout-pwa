import type { RoomEnvelope } from "@canvas-physics/protocol";
import type {
  RoomTransport,
  TransportStatus,
  TransportTraffic,
} from "@canvas-physics/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersistentLoungeTransport } from "./lounge-room-transport";

vi.mock("@canvas-physics/client", () => ({
  WebSocketRoomTransport: class {},
}));

class FakeTransport implements RoomTransport {
  status: TransportStatus = "idle";
  traffic: TransportTraffic = {
    inboundBytes: 0,
    outboundBytes: 0,
    inboundMessages: 0,
    outboundMessages: 0,
    droppedOutbound: 0,
  };
  readonly reliable: RoomEnvelope[] = [];
  private readonly messages = new Set<(message: RoomEnvelope) => void>();
  private readonly statuses = new Set<
    (status: TransportStatus, detail?: string) => void
  >();

  async connect() {}
  sendReliable(message: RoomEnvelope) {
    this.reliable.push(message);
  }
  sendEphemeralReliable() {
    return this.status === "open";
  }
  sendRealtime() {}
  onMessage(handler: (message: RoomEnvelope) => void) {
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onStatus(handler: (status: TransportStatus, detail?: string) => void) {
    this.statuses.add(handler);
    return () => this.statuses.delete(handler);
  }
  close() {
    this.status = "closed";
  }
  publish(status: TransportStatus, detail?: string) {
    this.status = status;
    for (const handler of this.statuses) handler(status, detail);
  }
}

describe("persistent Lounge room transport", () => {
  afterEach(() => vi.useRealTimers());

  it("replaces an exhausted connection without making the room terminal", async () => {
    vi.useFakeTimers();
    const transports: FakeTransport[] = [];
    const connectionStates: string[] = [];
    const subject = createPersistentLoungeTransport(
      vi.fn().mockResolvedValue("credential"),
      (state) => connectionStates.push(state),
      () => {
        const transport = new FakeTransport();
        transports.push(transport);
        return transport;
      },
    );
    const statuses: TransportStatus[] = [];
    subject.onStatus((status) => statuses.push(status));
    await subject.connect({
      roomId: "team:one:lounge",
      serverUrl: "https://canvas.example",
    });
    transports[0].publish("open");
    subject.sendReliable({} as RoomEnvelope);
    expect(transports[0].reliable).toHaveLength(1);

    transports[0].publish("failed", "network unavailable");
    expect(connectionStates.at(-1)).toBe("reconnecting");
    expect(statuses).not.toContain("failed");
    expect(statuses).not.toContain("reconnecting");
    subject.sendReliable({} as RoomEnvelope);
    expect(transports[0].reliable).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(transports).toHaveLength(2);
    transports[1].publish("open");
    expect(statuses.at(-1)).toBe("open");
    expect(connectionStates.at(-1)).toBe("online");
    subject.sendReliable({} as RoomEnvelope);
    expect(transports[1].reliable).toHaveLength(1);
  });

  it("keeps an initial connection failure terminal", async () => {
    const transports: FakeTransport[] = [];
    const subject = createPersistentLoungeTransport(
      vi.fn().mockResolvedValue("credential"),
      vi.fn(),
      () => {
        const transport = new FakeTransport();
        transports.push(transport);
        return transport;
      },
    );
    const statuses: TransportStatus[] = [];
    subject.onStatus((status) => statuses.push(status));
    await subject.connect({
      roomId: "team:one:lounge",
      serverUrl: "https://canvas.example",
    });

    transports[0].publish("failed", "never connected");
    expect(statuses.at(-1)).toBe("failed");
  });
});
