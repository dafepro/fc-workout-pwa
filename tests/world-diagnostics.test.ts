import { describe, expect, it } from "vitest";
import { createWorldProtocolProbe } from "../e2e/world-diagnostics";

describe("live World protocol diagnostics", () => {
  it("correlates a kick with acknowledgement without exposing identities", () => {
    let elapsed = 100;
    const probe = createWorldProtocolProbe(
      () => "shared-kick",
      () => elapsed,
    );
    probe.received({ type: "welcome", session: "private-primary-session" });
    probe.received({ type: "room", host: "private-peer-session", epoch: 7 });
    elapsed = 140;
    probe.sent({ type: "input", sequence: 12, input: { kick: true } });
    probe.received({
      type: "snapshot",
      inputAcks: { "private-primary-session": 11 },
      state: {
        players: {
          "private-primary-session": { kick: 0.5 },
          "private-peer-session": { kick: 0 },
        },
      },
    });
    expect(probe.snapshot().kicks[0].acknowledged).toBe(false);
    probe.received({
      type: "snapshot",
      inputAcks: { "private-primary-session": 13 },
    });
    expect(probe.snapshot()).toMatchObject({
      isHost: false,
      hostExists: true,
      localKickSnapshots: 1,
      peerKickSnapshots: 0,
      kicks: [{ sequence: 12, epoch: 7, afterMs: 40, acknowledged: true }],
    });
    expect(probe.kickCount()).toBe(1);
    expect(JSON.stringify(probe.snapshot())).not.toContain("private-");
  });

  it("records actual host handoffs and bounded stage-relative history", () => {
    let elapsed = 0;
    const probe = createWorldProtocolProbe(
      () => "render-diagnostics",
      () => elapsed,
    );
    probe.received({ type: "welcome", session: "private-primary" });
    for (let epoch = 1; epoch <= 50; epoch++) {
      elapsed += 10;
      probe.received({ type: "room", host: "private-primary", epoch });
    }
    elapsed = 505;
    probe.received({ type: "room", host: null, epoch: 51 });
    expect(probe.snapshot().transitions).toHaveLength(40);
    expect(probe.snapshot().transitions.at(-1)).toEqual({
      stage: "render-diagnostics",
      afterMs: 505,
      epoch: 51,
      hostExists: false,
      isHost: false,
    });
    expect(probe.snapshot().transitions.at(-2)?.isHost).toBe(true);
  });

  it("does not acknowledge a prior connection's reused input sequence", () => {
    const probe = createWorldProtocolProbe(() => "shared-kick");
    probe.received({ type: "welcome", session: "private-first" });
    probe.sent({ type: "input", sequence: 2, input: { kick: true } });
    probe.received({ type: "welcome", session: "private-second" });
    probe.sent({ type: "input", sequence: 2, input: { kick: true } });
    probe.received({ type: "snapshot", inputAcks: { "private-second": 3 } });
    expect(probe.snapshot().kicks.map((kick) => kick.acknowledged)).toEqual([
      false,
      true,
    ]);
  });
});
