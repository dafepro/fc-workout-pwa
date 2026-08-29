import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loungePerformanceBudget } from "../e2e/lounge-performance-budget";

describe("Team Lounge performance budget", () => {
  it("keeps the physical-device and automated gates measurable", () => {
    expect(loungePerformanceBudget.layout.viewportWidthCssPx).toBe(320);
    expect(loungePerformanceBudget.layout.maxHorizontalOverflowCssPx).toBe(1);
    expect(loungePerformanceBudget.layout.minInteractiveTargetCssPx).toBe(44);

    expect(
      loungePerformanceBudget.latency.canvasReadyP95Ms,
    ).toBeLessThanOrEqual(5_000);
    expect(
      loungePerformanceBudget.latency.reconnectReadyP95Ms,
    ).toBeLessThanOrEqual(3_000);

    expect(
      loungePerformanceBudget.cpu.sustainedAveragePercent,
    ).toBeLessThanOrEqual(25);
    expect(loungePerformanceBudget.cpu.p95Percent).toBeLessThanOrEqual(50);
    expect(loungePerformanceBudget.memory.peakResidentMiB).toBeLessThanOrEqual(
      180,
    );
    expect(loungePerformanceBudget.memory.maxGrowthMiB).toBeLessThanOrEqual(20);

    expect(loungePerformanceBudget.network.maxColdLoadBytes).toBe(
      4 * 1024 * 1024,
    );
    expect(loungePerformanceBudget.network.maxReconnectBytes).toBe(384 * 1024);
    expect(
      loungePerformanceBudget.network.permitRequestsPerCommittedMutation,
    ).toBe(1);
    expect(
      loungePerformanceBudget.network.maxPermitRoundTripBytes,
    ).toBeLessThanOrEqual(4 * 1024);
    expect(
      loungePerformanceBudget.network.maxIdleWebSocketBytesPerSecond,
    ).toBeLessThanOrEqual(8 * 1024);
    expect(
      loungePerformanceBudget.network.maxEditSequenceWebSocketBytes,
    ).toBeLessThanOrEqual(32 * 1024);
  });

  it("keeps the shipped Lounge artwork inside its static asset allowance", () => {
    const assetDirectory = join(process.cwd(), "public", "team-lounge");
    const bytes = readdirSync(assetDirectory).reduce(
      (total, name) => total + statSync(join(assetDirectory, name)).size,
      0,
    );

    expect(bytes).toBeLessThanOrEqual(
      loungePerformanceBudget.network.maxStaticLoungeAssetBytes,
    );
  });
});
