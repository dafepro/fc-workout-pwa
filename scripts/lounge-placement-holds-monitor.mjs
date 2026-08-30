#!/usr/bin/env node

const requiredCounts = [
  "totalHeld",
  "expiredPermits",
  "awaitingCanvas",
  "staleCanvasOutcomes",
  "totalItemMutations",
  "expiredItemPermits",
  "awaitingItemOutcomes",
  "staleItemOutcomes",
];

let input = "";
for await (const chunk of process.stdin) input += chunk;

let report;
try {
  report = JSON.parse(input);
} catch {
  failInvalid();
}

if (
  !report ||
  typeof report !== "object" ||
  requiredCounts.some(
    (field) => !Number.isSafeInteger(report[field]) || report[field] < 0,
  )
) {
  failInvalid();
}

const stalePlacements = report.staleCanvasOutcomes;
const staleEdits = report.staleItemOutcomes;
if (stalePlacements > 0 || staleEdits > 0) {
  process.stderr.write(
    `stale Canvas outcomes require review: placements=${stalePlacements}, item mutations=${staleEdits}\n`,
  );
  process.exit(2);
}

process.stdout.write(
  `no stale Canvas outcomes: held=${report.totalHeld}, awaiting=${report.awaitingCanvas}, item mutations=${report.totalItemMutations}, awaiting item outcomes=${report.awaitingItemOutcomes}\n`,
);

function failInvalid() {
  process.stderr.write("invalid Lounge placement hold report\n");
  process.exit(1);
}
