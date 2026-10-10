import * as THREE from "three";
import type { Zoomap } from "zmap";

const recordings = new WeakMap<
  Zoomap,
  ReturnType<typeof installMotionRecorder>
>();
const columns = [
  "ms",
  "submitMs",
  "tick",
  "host",
  "shownX",
  "shownY",
  "shownZ",
  "velocityX",
  "velocityZ",
  "predictedX",
  "predictedZ",
  "authorityX",
  "authorityZ",
  "cameraX",
  "cameraY",
  "cameraZ",
  "screenX",
  "screenY",
];

/** Numeric poses only: never retain identities, messages or connection credentials. */
export function installMotionRecorder(world: Zoomap) {
  const frames: number[][] = [];
  const longTasks: { ms: number; durationMs: number }[] = [];
  const view = world.view,
    original = view.render;
  const start = performance.now(),
    point = new THREE.Vector3();
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        longTasks.push({
          ms: entry.startTime - start,
          durationMs: entry.duration,
        });
      if (longTasks.length > 40) longTasks.splice(0, longTasks.length - 40);
    });
    observer.observe({ type: "longtask" });
  }
  const render: typeof original = (...args) => {
    const before = performance.now();
    original.apply(view, args);
    const submit = performance.now() - before;
    const body = args[3],
      predicted = world.local,
      authority = world.state.players[world.session];
    if (!body || !predicted || !authority) return;
    point.set(body.x, body.y + 0.8, body.z).project(view.camera);
    frames.push([
      before - start,
      submit,
      world.state.tick,
      +(world.host === world.session),
      body.x,
      body.y,
      body.z,
      body.vx,
      body.vz,
      predicted.x,
      predicted.z,
      authority.x,
      authority.z,
      view.camera.position.x,
      view.camera.position.y,
      view.camera.position.z,
      ((point.x + 1) * view.canvas.clientWidth) / 2,
      ((1 - point.y) * view.canvas.clientHeight) / 2,
    ]);
    while (
      frames.length > 2400 ||
      (frames[0] && before - start - frames[0][0] > 10000)
    )
      frames.shift();
  };
  view.render = render;
  const recording = {
    capture() {
      let movingFrames = 0,
        heldMovingFrames = 0,
        backwardsMovingFrames = 0,
        maxFrameGapMs = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1],
          b = frames[i],
          dt = b[0] - a[0];
        maxFrameGapMs = Math.max(maxFrameGapMs, dt);
        if (
          dt < 4 ||
          dt > 100 ||
          Math.hypot(a[7], a[8]) < 1 ||
          Math.hypot(b[7], b[8]) < 1 ||
          Math.hypot(b[7] - a[7], b[8] - a[8]) > 0.1
        )
          continue;
        movingFrames++;
        const dx = b[4] - a[4],
          dz = b[6] - a[6];
        if (Math.hypot(dx, dz) < 0.00001) heldMovingFrames++;
        if (dx * b[7] + dz * b[8] < -0.0001) backwardsMovingFrames++;
      }
      return {
        columns,
        frames: frames.map((row) =>
          row.map((n) => Math.round(n * 10000) / 10000),
        ),
        longTasks: longTasks.filter((task) => task.ms >= (frames[0]?.[0] ?? 0)),
        summary: {
          movingFrames,
          heldMovingFrames,
          backwardsMovingFrames,
          maxFrameGapMs,
        },
        note: "Last ten seconds of submitted frames; submitMs is CPU submission time, not GPU completion or physical display timing. Hold/reversal counts require steady velocity; collisions can also create holds.",
      };
    },
    dispose() {
      if (view.render === render) view.render = original;
      observer?.disconnect();
      recordings.delete(world);
    },
  };
  recordings.set(world, recording);
  return recording;
}
export const captureMotion = (world: Zoomap | null) =>
  world ? recordings.get(world)?.capture() : undefined;
