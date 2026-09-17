import * as THREE from "three";
import { createCharacterOcclusion } from "./character-occlusion";
import {
  AvatarLibrary,
  validateCatalog,
  validateWieldCatalog,
  ComicStyle,
  WieldController,
  WieldLibrary,
  defaultRecipe,
  emptyWieldLoadout,
  fieldToolBehaviors,
  disposeAvatarResources,
  isEmoteId,
  type AvatarInstance,
  type Motion,
} from "@zmap/avatar-studio";
import {
  WAKE_MOTION,
  type Body,
  type Character,
  type Identity,
  type PlayerActionState,
  type WorldMap,
  type WorldActionEvent,
} from "zmap";

/** The consuming simulation maps accepted action phases into reusable pose inputs. */
export function fieldCharacterMotion(
  body: Body,
  action: PlayerActionState | undefined,
  tick: number,
  reducedMotion = false,
  facing = body.facing,
): Motion {
  const pose: NonNullable<Motion["pose"]> = {};
  const phase = action?.phase;
  const progress = action
    ? THREE.MathUtils.clamp(
        (tick - action.phaseStarted) / WAKE_MOTION.chargeTicks,
        0,
        1,
      )
    : 0;
  if (phase === "charging")
    Object.assign(pose, {
      crouch: 0.68 * progress,
      lean: 0.32 * progress,
      stance: 0.8,
    });
  if (phase === "leaping") {
    const landing = THREE.MathUtils.clamp((-body.vy + 0.8) / 2, 0, 1);
    Object.assign(pose, {
      crouch: 0.1 + 0.9 * landing,
      lean: 0.18 + 0.82 * landing,
      stance: 0.8,
      tuck: (1 - landing) * 0.8,
    });
  }
  if (phase === "impact")
    Object.assign(pose, { crouch: 1, lean: 1, stance: 0.8, recoil: 0.12 });
  if (phase === "recoiling")
    Object.assign(pose, {
      crouch: 0.12,
      lean: -0.24,
      stance: 0.6,
      tuck: 0.45,
      recoil: 0.35,
    });
  if (phase === "cooldown" && action?.tool === "wake-driver") {
    const settle = Math.max(0, 1 - (tick - action.phaseStarted) / 7);
    Object.assign(pose, {
      crouch: 0.3 * settle,
      stance: 0.6 * settle,
      recoil: 0.18 * settle,
    });
  }
  return {
    reducedMotion,
    carryLean: phase === "braced" ? 0.15 : phase === "reeling" ? -0.22 : 0,
    velocity: {
      x: body.vx * Math.cos(facing) - body.vz * Math.sin(facing),
      z: body.vx * Math.sin(facing) + body.vz * Math.cos(facing),
    },
    grounded:
      Math.abs(body.vy) < 0.001 && phase !== "leaping" && phase !== "recoiling",
    pose,
    gesture: body.gesture > 0 ? "wave" : "idle",
    ...(action?.performance?.emote &&
    isEmoteId(action.performance.emote.id) &&
    tick >= action.performance.emote.startedTick
      ? {
          emote: {
            id: action.performance.emote.id,
            elapsed: (tick - action.performance.emote.startedTick) / 30,
          },
        }
      : {}),
  };
}

/** App integration: identity selects appearance; accepted simulation state selects equipment. */
export async function loadActionKit(
  onError: (error: unknown) => void,
  base = new URL("/team-world-assets/v0.1.1/", location.href),
) {
  const equipmentBase = new URL("action/", base);
  const json = async (url: URL) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok)
      throw Error(`Field components unavailable (${response.status})`);
    return response.json();
  };
  const [catalog, equipment] = await Promise.all([
    json(new URL("catalog.json", base)),
    json(new URL("catalog.json", equipmentBase)),
  ]);
  validateCatalog(catalog);
  validateWieldCatalog(equipment);
  const library = new AvatarLibrary(catalog, base.href),
    wieldLibrary = new WieldLibrary(equipment, equipmentBase.href);
  const appearances = new Map<string, () => AvatarInstance>();
  const choices = [
    {
      id: "burgundy",
      hair: "hair-sweep",
      skin: "#c68b60",
      color: "#ece8dd",
      weight: 0,
    },
    {
      id: "saffron",
      hair: "hair-halo",
      skin: "#855538",
      color: "#d4a149",
      weight: 0.55,
    },
    {
      id: "sage",
      hair: "hair-pony",
      skin: "#edc39d",
      color: "#547780",
      weight: -0.35,
    },
  ];
  try {
    // Await all settled before releasing a failed batch's shared source libraries.
    const prepared = await Promise.allSettled(
      choices.map(async (choice) => {
        const recipe = defaultRecipe(catalog);
        recipe.parts.hair = choice.hair;
        recipe.body = { weight: choice.weight };
        recipe.colors = {
          skin: choice.skin,
          hair: choice.id === "sage" ? "#ac793e" : "#302922",
          primary: choice.color,
          secondary: "#29383d",
        };
        appearances.set(choice.id, await library.prepare(recipe));
      }),
    );
    const failure = prepared.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const loaded = await Promise.allSettled(
      [
        ...wieldLibrary.catalog.items,
        ...Object.values(wieldLibrary.catalog.grips),
      ].map(async (item) => {
        const root = await wieldLibrary.instantiate(item);
        disposeAvatarResources(root);
      }),
    );
    const failed = loaded.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  } catch (error) {
    library.dispose();
    wieldLibrary.dispose();
    throw error;
  }
  let closed = false;
  const toyRadii = new Map<string, number>();
  const cannonIds = new Set<string>();
  const report = (error: unknown) => {
    if (!closed) {
      try {
        onError(error);
      } catch {
        /* the host cannot interrupt visual cleanup */
      }
    }
  };
  const owned = new Set<{
    dispose(): void;
    wield: WieldController;
    get pending(): boolean;
    readiness(): {
      session: string | null;
      desired: string | null;
      ready: boolean;
      pending: boolean;
      error: string | null;
      drawn: boolean;
      emote: ReturnType<AvatarInstance["animationDiagnostics"]>["emote"];
    };
    retry(): void;
  }>();
  function character(identity: Identity): Character {
    if (closed) throw Error("Field kit is disposed");
    const create = appearances.get(identity.appearance);
    if (!create) throw Error("Appearance is not approved for this yard");
    const avatar = create(),
      root = new THREE.Group(),
      style = new ComicStyle({ inkWidth: 1.5 });
    root.add(avatar.object);
    const occlusion = createCharacterOcclusion();
    let action: PlayerActionState | undefined,
      tick = 0,
      desired: string | null = null,
      pending = false,
      disposed = false,
      revision = 0;
    let styledLeft: THREE.Object3D | undefined;
    let styledRight: THREE.Object3D | undefined;
    let styledWidth = 0,
      styledHeight = 0,
      styled = false;
    let session: string | null = null,
      loadError: string | null = null;
    let impact: WorldActionEvent | undefined;
    let displayedFacing: number | undefined, previousTime: number | undefined;
    const wield = new WieldController(
      avatar,
      wieldLibrary,
      fieldToolBehaviors((id) =>
        action?.tool && id === `wield-${action.tool}`
          ? {
              phase: action.phase,
              time: tick / 30,
              carrierPitch:
                avatar.animationDiagnostics().pose.lean * 0.36 -
                avatar.animationDiagnostics().pose.recoil * 0.12,
              progress: Math.min(
                1,
                Math.max(0, 1 - (action.phaseUntil - tick) / 6),
              ),
              impact:
                impact && ["rebound", "boost", "pulse"].includes(impact.kind)
                  ? {
                      id: impact.id,
                      kind: impact.kind as "rebound" | "boost" | "pulse",
                      age: (tick - impact.tick) / 30,
                    }
                  : undefined,
            }
          : undefined,
      ),
      {
        onError: (error, hand) => {
          if (!disposed && hand) {
            loadError = error instanceof Error ? error.message : String(error);
            report(error);
          }
        },
      },
    );
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({
        color: "#344a48",
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.009;
    root.add(shadow);
    const cableGeometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(6), 3),
    );
    const cable = new THREE.Line(
      cableGeometry,
      new THREE.LineBasicMaterial({ color: "#d4a149" }),
    );
    cable.name = "field-cable";
    cable.visible = false;
    root.add(cable);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({
        color: "#6999ac",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    pulse.name = "field-pulse";
    pulse.rotation.x = -Math.PI / 2;
    pulse.visible = false;
    root.add(pulse);
    const dust = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({
        color: "#d7b98a",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
      12,
    );
    dust.name = "field-impact-dust";
    dust.count = 0;
    dust.frustumCulled = false;
    root.add(dust);
    const dustMatrix = new THREE.Matrix4(),
      dustRotation = new THREE.Quaternion(),
      dustScale = new THREE.Vector3();
    const aim = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.15, 3),
      new THREE.MeshBasicMaterial({ color: "#cb993e" }),
    );
    aim.name = "field-aim";
    aim.rotation.x = Math.PI / 2;
    aim.position.set(0, 0.06, 1.05);
    avatar.object.add(aim);
    const start = new THREE.Vector3(),
      end = new THREE.Vector3(),
      point = new THREE.Vector3();
    const setTool = (tool: string | null) => {
      if (disposed) return;
      desired = tool;
      pending = true;
      loadError = null;
      const current = ++revision;
      const loadout = emptyWieldLoadout(wieldLibrary.catalog);
      if (tool) loadout.twoHanded = { item: `wield-${tool}`, primary: "right" };
      if (action?.performance) wield.setDrawn(false, { immediate: true });
      // Transaction retains the last complete pair until the new pair is verified.
      void wield
        .setLoadout(loadout)
        .catch((error) => {
          if (!disposed && current === revision) {
            loadError = error instanceof Error ? error.message : String(error);
            report(error);
          }
        })
        .finally(() => {
          if (!disposed && current === revision) pending = false;
        });
    };
    const instance = {
      wield,
      get pending() {
        return pending;
      },
      readiness() {
        const held = wield.getHand("right");
        const matches =
          desired === null
            ? !wield.getHand("left") && !held
            : held?.state === "ready" &&
              held.item.id === `wield-${desired}` &&
              wield.getHand("left")?.object === held.object;
        return {
          session,
          desired,
          ready: !disposed && !pending && !loadError && !!matches,
          pending,
          error: loadError,
          drawn: !!matches && wield.isDrawn(),
          emote: avatar.animationDiagnostics().emote,
        };
      },
      retry() {
        if (loadError && !pending && !disposed) setTool(desired);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        pending = false;
        revision++;
        occlusion.dispose();
        style.clear();
        wield.dispose();
        avatar.dispose();
        dust.dispose();
        for (const object of [shadow, cable, pulse, dust, aim]) {
          object.geometry.dispose();
          object.material.dispose();
          object.removeFromParent();
        }
        root.clear();
        owned.delete(instance);
      },
    };
    owned.add(instance);
    return {
      object: root,
      dispose: instance.dispose,
      update(body, time, context) {
        if (disposed || !context) return;
        session = context.session;
        action = context.state.actions?.players[context.session];
        tick = context.presentationTick ?? context.state.tick;
        impact = undefined;
        for (
          let i = (context.state.actions?.events.length ?? 0) - 1;
          i >= 0;
          i--
        ) {
          const event = context.state.actions!.events[i];
          if (
            event.session === context.session &&
            event.tool === action?.tool &&
            ["rebound", "boost", "pulse"].includes(event.kind)
          ) {
            impact = event;
            break;
          }
        }
        const tool = action?.tool ?? null;
        if (tool !== desired) setTool(tool);
        if (!pending && action?.performance)
          wield.setDrawn(action.performance.drawn, {
            from: action.performance.equipmentFrom,
            elapsed: Math.max(
              0,
              (tick - action.performance.equipmentStarted) / 30,
            ),
          });
        const targetFacing = body.facing;
        const dt =
          previousTime === undefined
            ? 0
            : Math.max(0, Math.min(0.1, time - previousTime));
        if (
          displayedFacing === undefined ||
          previousTime === undefined ||
          time < previousTime ||
          time - previousTime > 0.25 ||
          context.reducedMotion
        )
          displayedFacing = targetFacing;
        else
          displayedFacing +=
            Math.atan2(
              Math.sin(targetFacing - displayedFacing),
              Math.cos(targetFacing - displayedFacing),
            ) *
            (1 - Math.exp(-18 * dt));
        previousTime = time;
        avatar.object.rotation.y = displayedFacing - body.facing;
        const motion = fieldCharacterMotion(
          body,
          action,
          tick,
          context.reducedMotion,
          displayedFacing,
        );
        // A nearby accepted launch gets a brief startled crouch. This is a pose,
        // not a local impulse, and never interrupts a player's equipped action.
        if (!tool && !context.reducedMotion) {
          for (const event of context.state.objects?.events ?? []) {
            if (event.kind !== "fire" || !cannonIds.has(event.object)) continue;
            const data = event.data as {
              position?: { x: number; y: number; z: number };
            };
            const age = (tick - event.tick) / 30;
            if (
              !data.position ||
              age < 0 ||
              age >= 0.5 ||
              Math.hypot(body.x - data.position.x, body.z - data.position.z) >
                5.5 ||
              Math.abs(body.y + 0.8 - data.position.y) > 1.5
            )
              continue;
            const startle = Math.sin((Math.PI * age) / 0.5);
            motion.pose = {
              ...motion.pose,
              crouch: startle * 0.28,
              lean: -startle * 0.12,
              recoil: startle * 0.7,
              stance: startle * 0.3,
            };
          }
        }
        avatar.update(time, motion);
        root.updateWorldMatrix(true, true);
        cable.visible = false;
        pulse.visible = false;
        dust.count = 0;
        aim.visible = !!tool && action?.performance?.drawn !== false;
        const held = wield.getHand("right");
        if (
          action?.phase === "reeling" &&
          action.target &&
          held?.state === "ready" &&
          held.item.id === "wield-tether-winch"
        ) {
          const target = context.state.toys[action.target];
          if (target) {
            held.anchor("cable").getWorldPosition(start);
            end.set(
              target.x,
              target.y + (toyRadii.get(action.target) ?? 0),
              target.z,
            );
            root.worldToLocal(start);
            root.worldToLocal(end);
            const positions = cableGeometry.attributes.position;
            positions.setXYZ(0, start.x, start.y, start.z);
            positions.setXYZ(1, end.x, end.y, end.z);
            positions.needsUpdate = true;
            cableGeometry.computeBoundingSphere();
            cable.visible = true;
          }
        }
        let last;
        const events = context.state.actions?.events ?? [];
        for (let index = events.length - 1; index >= 0; index--)
          if (
            events[index].session === context.session &&
            events[index].kind === "pulse"
          ) {
            last = events[index];
            break;
          }
        if (last) {
          const age = tick - last.tick;
          if (age >= 0 && age < 20) {
            point.set(last.position.x, last.position.y, last.position.z);
            root.worldToLocal(point);
            pulse.position.copy(point);
            pulse.scale.setScalar(
              context.reducedMotion ? 3 : 0.2 + (2.8 * age) / 20,
            );
            pulse.material.opacity = context.reducedMotion
              ? 0.5
              : 0.8 * (1 - age / 20);
            pulse.visible = true;
            if (!context.reducedMotion && age < 15) {
              const seconds = age / 30;
              for (let i = 0; i < 12; i++) {
                const angle = i * 2.3999632297,
                  radius = 0.18 + seconds * (1.4 + (i % 3) * 0.35);
                point.set(
                  last.position.x + Math.cos(angle) * radius,
                  last.position.y +
                    0.035 +
                    Math.max(
                      0,
                      seconds * (1.2 + (i % 4) * 0.12) - 3 * seconds * seconds,
                    ),
                  last.position.z + Math.sin(angle) * radius,
                );
                root.worldToLocal(point);
                dustRotation.setFromEuler(
                  new THREE.Euler(i * 0.7, angle, seconds * 2),
                );
                dustScale.setScalar(
                  (0.045 + 0.009 * (i % 3)) * (1 - (0.65 * seconds) / 0.5),
                );
                dustMatrix.compose(point, dustRotation, dustScale);
                dust.setMatrixAt(i, dustMatrix);
              }
              dust.count = 12;
              dust.instanceMatrix.needsUpdate = true;
              dust.material.opacity = 0.7 * (1 - age / 15);
            }
          }
        }
        const left = wield.getHand("left")?.object;
        const right = wield.getHand("right")?.object;
        // These approved appearances have fixed topology; only equipment changes
        // add meshes. Animation changes transforms, not the style bindings.
        if (
          !styled ||
          left !== styledLeft ||
          right !== styledRight ||
          context.viewport.x !== styledWidth ||
          context.viewport.y !== styledHeight
        ) {
          style.update(avatar.object, context.viewport);
          occlusion.update(avatar.object);
          styled = true;
          styledLeft = left;
          styledRight = right;
          styledWidth = context.viewport.x;
          styledHeight = context.viewport.y;
        }
      },
    };
  }
  function scenery(_scene: THREE.Scene, map: WorldMap) {
    for (const object of map.objects ?? [])
      if (object.behavior === "cannon") cannonIds.add(object.id);
    for (const toy of map.toys) toyRadii.set(toy.id, toy.radius);
  }
  return {
    character,
    scenery,
    retryFailed(session?: string) {
      for (const character of owned)
        if (session === undefined || character.readiness().session === session)
          character.retry();
    },
    isPreparing() {
      for (const character of owned) if (character.pending) return true;
      return false;
    },
    diagnostics: () => ({
      characters: owned.size,
      readiness: [...owned].map((character) => character.readiness()),
      pending: [...owned].filter((c) => c.pending).length,
      equipment: [...owned].map((c) => c.wield.diagnostics()),
    }),
    dispose() {
      if (closed) return;
      closed = true;
      for (const item of [...owned]) item.dispose();
      toyRadii.clear();
      cannonIds.clear();
      library.dispose();
      wieldLibrary.dispose();
    },
  };
}
