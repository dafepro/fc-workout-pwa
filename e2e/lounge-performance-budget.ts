export const loungePerformanceBudget = {
  layout: {
    viewportWidthCssPx: 320,
    maxHorizontalOverflowCssPx: 1,
    minInteractiveTargetCssPx: 44,
  },
  latency: {
    canvasReadyP95Ms: 5_000,
    reconnectReadyP95Ms: 3_000,
    automatedReadyCeilingMs: 15_000,
  },
  cpu: {
    measurementWindowMinutes: 15,
    sustainedAveragePercent: 25,
    p95Percent: 50,
    maxContinuousOverEightyPercentMs: 1_000,
  },
  memory: {
    peakResidentMiB: 180,
    maxGrowthMiB: 20,
    growthWindowStartMinute: 5,
    growthWindowEndMinute: 15,
  },
  network: {
    maxColdLoadBytes: 4 * 1024 * 1024,
    maxStaticLoungeAssetBytes: 3 * 1024 * 1024,
    maxReconnectBytes: 384 * 1024,
    maxFifteenMinuteSessionBytes: 12 * 1024 * 1024,
    permitRequestsPerCommittedMutation: 1,
    maxPermitRoundTripBytes: 4 * 1024,
    maxEditSequenceWebSocketBytes: 32 * 1024,
    maxIdleWebSocketBytesPerSecond: 8 * 1024,
  },
} as const;
