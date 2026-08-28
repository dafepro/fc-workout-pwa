import type { Page } from "@playwright/test";

export const loungeNetworkBudget = {
  permitRequestsPerCommittedMutation: 1,
  maxPermitRoundTripBytes: 4 * 1024,
  maxEditSequenceWebSocketBytes: 32 * 1024,
  maxIdleWebSocketBytesPerSecond: 8 * 1024,
} as const;

export function observeLoungeNetwork(page: Page) {
  let active = false;
  let permitRequests = 0;
  const permitKinds: string[] = [];
  const permitRoundTripBytes: number[] = [];
  let sentWebSocketBytes = 0;
  let receivedWebSocketBytes = 0;
  const pendingMeasurements: Promise<void>[] = [];

  page.on("requestfinished", (request) => {
    if (!active || !request.url().includes("/mutation-permits")) return;
    permitRequests += 1;
    const body = request.postDataJSON() as { kind?: unknown };
    if (typeof body.kind === "string") permitKinds.push(body.kind);
    pendingMeasurements.push(
      request.sizes().then((sizes) => {
        permitRoundTripBytes.push(
          sizes.requestBodySize +
            sizes.requestHeadersSize +
            sizes.responseBodySize +
            sizes.responseHeadersSize,
        );
      }),
    );
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (active) sentWebSocketBytes += payloadBytes(payload);
    });
    socket.on("framereceived", ({ payload }) => {
      if (active) receivedWebSocketBytes += payloadBytes(payload);
    });
  });

  return {
    start() {
      active = true;
    },
    async finish() {
      active = false;
      await Promise.all(pendingMeasurements);
      return {
        permitRequests,
        permitKinds,
        permitRoundTripBytes,
        webSocketBytes: sentWebSocketBytes + receivedWebSocketBytes,
      };
    },
  };
}

function payloadBytes(payload: string | Buffer) {
  return typeof payload === "string"
    ? Buffer.byteLength(payload, "utf8")
    : payload.byteLength;
}
