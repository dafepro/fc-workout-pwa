import { worldCopy } from "../copy";
import * as THREE from "three";
import {
  findWalkPath,
  canWalkSegment,
  actionMovementLocked,
  WALK_SPEED,
  SPRINT_SPEED,
  type Vec3,
  type WorldMap,
  type Zoomap,
} from "zmap";
import { inside } from "zmap/core";

/** Pick the visible walk surface, including a ramp or bridge above the ground. */
export function pickWalkSurface(
  world: Zoomap,
  map: WorldMap,
  clientX: number,
  clientY: number,
): Vec3 | null {
  const rect = world.view.canvas.getBoundingClientRect(),
    ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    ),
    world.view.camera,
  );
  let nearest = Infinity,
    result: Vec3 | null = null;
  for (const surface of map.surfaces) {
    const slope = surface.slope ?? 0,
      plane = new THREE.Plane(
        new THREE.Vector3(0, 1, -slope),
        -surface.y + slope * surface.z,
      ).normalize();
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || !inside(surface, hit.x, hit.z)) continue;
    const distance = hit.distanceTo(ray.ray.origin);
    if (distance < nearest) {
      nearest = distance;
      result = { x: hit.x, y: hit.y, z: hit.z };
    }
  }
  return result;
}

export type MovementMode = "path" | "joystick";
/** Consumer-owned pointer UI over reusable geometry navigation and world-space input. */
export function createNavigationControls(
  world: Zoomap,
  map: WorldMap,
  ui: {
    stick: HTMLElement;
    status: HTMLElement;
    stop: HTMLButtonElement;
    sprint: HTMLButtonElement;
    interactAt?: (x: number, y: number) => boolean;
  },
) {
  const lifecycle = new AbortController(),
    signal = lifecycle.signal,
    canvas = world.view.canvas;
  let mode: MovementMode = "path",
    route: Vec3[] = [],
    target: Vec3 | null = null,
    waypoint = 1,
    frame = 0,
    dead = false,
    revision = -1,
    lastCheck = 0,
    lastProgress = 0,
    progressPoint = { x: 0, z: 0 },
    retries = 0,
    stickPointer: number | undefined;
  let tap:
    | { id: number; x: number; y: number; started: number; held: boolean }
    | undefined;
  let automaticPace = true,
    lastSteer = 0,
    desiredStick = { x: 0, z: 0, gain: 0 },
    pace = 0,
    previousFrame = 0;
  const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
  };
  const setPace = (speed: number, dt: number) => {
    pace += Math.max(-8 * dt, Math.min(6 * dt, speed - pace));
    world.setSprinting(pace > WALK_SPEED);
    return pace / (pace > WALK_SPEED ? SPRINT_SPEED : WALK_SPEED);
  };
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.17, 0.23, 32),
    new THREE.MeshBasicMaterial({
      color: 0x426f62,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x426f62,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  line.visible = false;
  world.view.scene.add(marker, line);
  const hint = () =>
    mode === "path" ? worldCopy.navigation.path : worldCopy.navigation.joystick;
  const status = (message: string) => {
    if (ui.status.textContent !== message) ui.status.textContent = message;
  };
  const stop = (message: string = hint(), clearSprint = true) => {
    if (dead) return;
    if (clearSprint) world.setSprinting(false);
    pace = 0;
    if (target || stickPointer !== undefined) world.setWorldInput(0, 0);
    target = null;
    route = [];
    marker.visible = line.visible = false;
    ui.stop.hidden = true;
    status(message);
  };
  const airborne = () => {
    const body = world.local;
    return (
      !!body &&
      (Math.abs(body.vy) > 0.05 ||
        actionMovementLocked(world.state.actions?.players[world.session]))
    );
  };
  let avoidRouteToys = false;
  const plan = (
    destination: Vec3,
    retry = false,
    avoidToys = false,
  ): boolean => {
    if (!retry) avoidRouteToys = avoidToys;
    if (dead) return false;
    if (!world.local || world.status !== "ready") {
      stop("Waiting for the field…");
      return false;
    }
    if (!retry) retries = 0;
    if (airborne()) {
      target = { ...destination };
      route = [];
      world.setWorldInput(0, 0);
      marker.visible = line.visible = false;
      ui.stop.hidden = false;
      status(worldCopy.navigation.landing);
      return true;
    }
    const routingMap = avoidRouteToys
      ? {
          ...map,
          blockers: [
            ...map.blockers,
            ...map.toys.map((toy) => {
              const body = world.state.toys[toy.id];
              const radius = toy.radius + 0.15;
              return {
                x: body.x - radius,
                z: body.z - radius,
                width: radius * 2,
                depth: radius * 2,
                y: body.y,
                height: toy.radius * 2,
              };
            }),
          ],
        }
      : map;
    const result = findWalkPath(routingMap, world.local, destination, {
      items: world.durable.items,
      catalog: world.options.catalog,
    });
    if (result.status !== "ready") {
      stop(
        result.status === "budget-exceeded"
          ? worldCopy.navigation.complex
          : worldCopy.navigation.unreachable,
      );
      return false;
    }
    target = { ...destination };
    route = result.points;
    waypoint = 1;
    revision = world.durable.revision;
    lastProgress = performance.now();
    progressPoint = { ...world.local };
    marker.position.set(destination.x, destination.y + 0.035, destination.z);
    marker.visible = line.visible = true;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      route.map((p) => new THREE.Vector3(p.x, p.y + 0.035, p.z)),
    );
    ui.stop.hidden = false;
    status(worldCopy.navigation.moving);
    return true;
  };
  const aim = (event: PointerEvent) => {
    if (!world.local || world.status !== "ready") return;
    const point = pickWalkSurface(world, map, event.clientX, event.clientY);
    if (
      point &&
      Math.hypot(point.x - world.local.x, point.z - world.local.z) > 0.15
    )
      world.setToolAim(point.x - world.local.x, point.z - world.local.z);
  };
  canvas.style.touchAction = "none";
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || tap) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      aim(event);
      tap = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        started: performance.now(),
        held: false,
      };
      canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "mouse" || tap?.id === event.pointerId)
        aim(event);
      if (tap?.id === event.pointerId) {
        tap.x = event.clientX;
        tap.y = event.clientY;
      }
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!tap || tap.id !== event.pointerId) return;
      const held = tap.held;
      tap = undefined;
      if (mode !== "path") return;
      if (held) {
        stop();
        return;
      }
      if (ui.interactAt?.(event.clientX, event.clientY)) {
        stop();
        return;
      }
      const point = pickWalkSurface(world, map, event.clientX, event.clientY);
      if (point) plan(point);
      else stop("Tap a walkable part of the yard");
    },
    { signal },
  );
  for (const name of ["pointercancel", "lostpointercapture"] as const)
    canvas.addEventListener(
      name,
      () => {
        if (tap?.held) stop();
        tap = undefined;
      },
      { signal },
    );
  const knob = ui.stick.querySelector<HTMLElement>("span")!;
  const stickMove = (event: PointerEvent) => {
    if (event.pointerId !== stickPointer) return;
    const rect = ui.stick.getBoundingClientRect(),
      x = (event.clientX - rect.left - rect.width / 2) / 35,
      y = (event.clientY - rect.top - rect.height / 2) / 35,
      magnitude = Math.hypot(x, y),
      length = Math.max(1, magnitude);
    const gain = magnitude < 0.12 ? 0 : Math.min(1, (magnitude - 0.12) / 0.88);
    desiredStick = {
      x: magnitude ? x / magnitude : 0,
      z: magnitude ? y / magnitude : 0,
      gain,
    };
    knob.style.transform = `translate(${(x / length) * 28}px,${(y / length) * 28}px)`;
  };
  const releaseStick = () => {
    if (stickPointer === undefined) return;
    const pointer = stickPointer;
    stickPointer = undefined;
    desiredStick = { x: 0, z: 0, gain: 0 };
    pace = 0;
    world.setSprinting(false);
    world.setWorldInput(0, 0);
    knob.style.transform = "";
    if (ui.stick.hasPointerCapture(pointer))
      ui.stick.releasePointerCapture(pointer);
  };
  ui.stick.addEventListener(
    "pointerdown",
    (event) => {
      if (
        mode !== "joystick" ||
        stickPointer !== undefined ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      stop(hint(), false);
      canvas.focus({ preventScroll: true });
      stickPointer = event.pointerId;
      ui.stick.setPointerCapture(stickPointer);
      stickMove(event);
    },
    { signal },
  );
  ui.stick.addEventListener("pointermove", stickMove, { signal });
  for (const name of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    ui.stick.addEventListener(
      name,
      (event) => {
        if (event.pointerId === stickPointer) releaseStick();
      },
      { signal },
    );
  // Capture cancellation before the existing keyboard handler sets fresh input.
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Escape",
        ].includes(event.code)
      ) {
        tap = undefined;
        stop(hint(), event.code === "Escape");
        releaseStick();
      }
    },
    { signal, capture: true },
  );
  const suspend = () => {
    stop();
    releaseStick();
    tap = undefined;
  };
  window.addEventListener("blur", suspend, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) suspend();
    },
    { signal },
  );
  ui.stop.addEventListener("click", () => stop(), { signal });
  // Keep pointer toggles from blurring the canvas and clearing a route's held intent.
  // Keyboard users can focus and activate the button normally.
  ui.sprint.addEventListener("pointerdown", (event) => event.preventDefault(), {
    signal,
  });
  ui.sprint.addEventListener(
    "click",
    () => {
      automaticPace = !automaticPace;
      canvas.focus({ preventScroll: true });
      if (!automaticPace) world.setSprinting(false);
    },
    { signal },
  );
  let lastSprintState = "";
  const update = (now: number) => {
    if (dead) return;
    frame = requestAnimationFrame(update);
    const dt = Math.min(
      0.05,
      Math.max(0, (now - (previousFrame || now)) / 1000),
    );
    previousFrame = now;
    if (
      tap &&
      mode === "path" &&
      now - tap.started >= 160 &&
      now - lastSteer >= 100
    ) {
      tap.held = true;
      lastSteer = now;
      const point = pickWalkSurface(world, map, tap.x, tap.y);
      if (
        point &&
        (!target ||
          Math.hypot(
            point.x - target.x,
            point.y - target.y,
            point.z - target.z,
          ) > 0.2)
      )
        plan(point);
    }
    if (stickPointer !== undefined) {
      if (world.status !== "ready" || document.hidden) {
        suspend();
        return;
      }
      const g = desiredStick.gain;
      const speed =
        g <= 0.65
          ? WALK_SPEED * smooth(g / 0.65)
          : WALK_SPEED +
            (automaticPace ? SPRINT_SPEED - WALK_SPEED : 0) *
              smooth((g - 0.65) / 0.35);
      const strength = setPace(speed, dt);
      world.setInput(desiredStick.x * strength, desiredStick.z * strength);
    }
    const sprintState = `${world.status}:${automaticPace}`;
    if (sprintState !== lastSprintState) {
      lastSprintState = sprintState;
      ui.sprint.disabled = world.status !== "ready";
      ui.sprint.setAttribute("aria-pressed", String(!automaticPace));
      ui.sprint.textContent = !automaticPace
        ? worldCopy.navigation.sprintOn
        : worldCopy.navigation.sprint;
    }
    if (!target) return;
    const body = world.local;
    if (!body || world.status !== "ready" || document.hidden) {
      stop();
      return;
    }
    if (airborne()) {
      world.setWorldInput(0, 0);
      lastProgress = now;
      route = [];
      line.visible = false;
      status(worldCopy.navigation.landing);
      return;
    }
    if (!route.length) {
      plan(target, true);
      return;
    }
    const point = route[waypoint],
      dx = point.x - body.x,
      dz = point.z - body.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.075 && Math.abs(point.y - body.y) < 0.15) {
      if (waypoint === route.length - 1 && world.host !== world.session) {
        const accepted = world.state.players[world.session];
        if (
          !accepted ||
          Math.hypot(
            accepted.x - point.x,
            accepted.y - point.y,
            accepted.z - point.z,
          ) > 0.15
        ) {
          // Prediction may arrive before the host consumes the last movement.
          // Keep the destination until the checkpoint agrees so a host handoff
          // can resume the route instead of abandoning it short of the target.
          world.setWorldInput(0, 0);
          status(worldCopy.navigation.arriving);
          return;
        }
      }
      if (++waypoint === route.length) {
        stop(worldCopy.navigation.arrived);
        return;
      }
    } else {
      // Arrival speed is measured in metres/second, independent of gait. A faster
      // sprint must not overshoot a tiny waypoint and orbit the destination.
      let remaining = distance;
      for (let i = waypoint + 1; i < route.length; i++)
        remaining += Math.hypot(
          route[i].x - route[i - 1].x,
          route[i].z - route[i - 1].z,
        );
      const requested =
        WALK_SPEED +
        (automaticPace ? SPRINT_SPEED - WALK_SPEED : 0) *
          smooth((remaining - 2) / 3);
      const strength = setPace(Math.min(requested, remaining * 5), dt);
      const speed = Math.min(
        strength,
        (distance * 12) / (world.sprinting ? SPRINT_SPEED : WALK_SPEED),
      );
      world.setWorldInput(
        (dx / Math.max(distance, 0.001)) * speed,
        (dz / Math.max(distance, 0.001)) * speed,
      );
    }
    if (Math.hypot(body.x - progressPoint.x, body.z - progressPoint.z) > 0.08) {
      lastProgress = now;
      progressPoint = { ...body };
    }
    if (now - lastCheck < 350) return;
    lastCheck = now;
    if (
      revision !== world.durable.revision ||
      now - lastProgress > 1600 ||
      !canWalkSegment(map, body, route[waypoint], {
        items: world.durable.items,
        catalog: world.options.catalog,
      })
    ) {
      if (++retries > 3) {
        stop("Movement interrupted · tap to choose a new route");
        return;
      }
      plan(target, true);
    }
  };
  const setMode = (value: MovementMode) => {
    if (dead) return;
    stop();
    releaseStick();
    tap = undefined;
    mode = value;
    ui.stick.hidden = mode !== "joystick";
    canvas.style.cursor = mode === "path" ? "crosshair" : "default";
    status(hint());
  };
  setMode("path");
  frame = requestAnimationFrame(update);
  return {
    setMode,
    stop,
    moveTo: (point: Vec3, options?: { avoidToys?: boolean }) =>
      plan(point, false, !!options?.avoidToys),
    state: () => ({
      mode,
      target: target ? { ...target } : null,
      route: route.map((point) => ({ ...point })),
      waypoint,
      sprinting: world.sprinting,
    }),
    dispose() {
      suspend();
      dead = true;
      cancelAnimationFrame(frame);
      lifecycle.abort();
      world.view.scene.remove(marker, line);
      marker.geometry.dispose();
      marker.material.dispose();
      line.geometry.dispose();
      line.material.dispose();
    },
  };
}
