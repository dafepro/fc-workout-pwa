import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeamCanvasDeviceCoordinator } from "./coordinator";

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const listeners = FakeBroadcastChannel.channels.get(name) ?? new Set();
    listeners.add(this);
    FakeBroadcastChannel.channels.set(name, listeners);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this)
        channel.onmessage?.(new MessageEvent("message", { data }));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeBroadcastChannel.channels.clear();
});

describe("Team Canvas device socket coordinator", () => {
  it("elects one socket owner and relays follower input through it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const firstOwnership = vi.fn();
    const secondOwnership = vi.fn();
    const firstOutbound = vi.fn();
    const secondOutbound = vi.fn();
    const first = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: firstOwnership,
      onInbound: vi.fn(),
      onOutbound: firstOutbound,
    });
    const second = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: secondOwnership,
      onInbound: vi.fn(),
      onOutbound: secondOutbound,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect([first.isOwner(), second.isOwner()].filter(Boolean)).toHaveLength(1);
    const follower = first.isOwner() ? second : first;
    const ownerOutbound = first.isOwner() ? firstOutbound : secondOutbound;
    follower.send("avatar-target");

    expect(ownerOutbound).toHaveBeenCalledWith("avatar-target");
    first.close();
    second.close();
  });

  it("broadcasts socket input to sibling tabs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const firstInbound = vi.fn();
    const secondInbound = vi.fn();
    const first = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: vi.fn(),
      onInbound: firstInbound,
      onOutbound: vi.fn(),
    });
    const second = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: vi.fn(),
      onInbound: secondInbound,
      onOutbound: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(500);

    const owner = first.isOwner() ? first : second;
    owner.broadcast("room-frame");

    expect(first.isOwner() ? secondInbound : firstInbound).toHaveBeenCalledWith(
      "room-frame",
    );
    first.close();
    second.close();
  });

  it("replays room readiness to a tab opened after the socket connected", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const first = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: vi.fn(),
      onInbound: vi.fn(),
      onOutbound: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(200);
    first.broadcast('{"v":1,"type":"room.ready"}');
    const lateInbound = vi.fn();
    const late = createTeamCanvasDeviceCoordinator("team-one", {
      onOwnershipChange: vi.fn(),
      onInbound: lateInbound,
      onOutbound: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(50);

    expect(lateInbound).toHaveBeenCalledWith('{"v":1,"type":"room.ready"}');
    first.close();
    late.close();
  });

  it("releases a hidden owner so a visible sibling can take the socket", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    let firstVisible = true;
    let secondVisible = true;
    let firstVisibility = () => {};
    let secondVisibility = () => {};
    const firstOwnership = vi.fn();
    const secondOwnership = vi.fn();
    const first = createTeamCanvasDeviceCoordinator(
      "team-one",
      callbacks(firstOwnership),
      {
        visible: () => firstVisible,
        listen: (handler) => {
          firstVisibility = handler;
          return () => {};
        },
      },
    );
    const second = createTeamCanvasDeviceCoordinator(
      "team-one",
      callbacks(secondOwnership),
      {
        visible: () => secondVisible,
        listen: (handler) => {
          secondVisibility = handler;
          return () => {};
        },
      },
    );
    await vi.waitFor(() =>
      expect([first.isOwner(), second.isOwner()]).toContain(true),
    );
    const ownerIsFirst = first.isOwner();
    firstVisible = !ownerIsFirst;
    secondVisible = ownerIsFirst;
    if (ownerIsFirst) firstVisibility();
    else secondVisibility();
    await vi.waitFor(() =>
      expect(ownerIsFirst ? second.isOwner() : first.isOwner()).toBe(true),
    );
    first.close();
    second.close();
  });
});

function callbacks(onOwnershipChange: ReturnType<typeof vi.fn>) {
  return {
    onOwnershipChange,
    onInbound: vi.fn(),
    onOutbound: vi.fn(),
  };
}
