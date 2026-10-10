/** Canvas's capture-once goal pattern, adapted to ZMap's shared fixed-step state.
 * Scores are ephemeral play state. They never grant participation or rewards. */
export const GOAL_HOLD_TICKS = 30;
export const GOAL_DISSOLVE_TICKS = 15;
export const BALL_RETURN_TICKS = 18;
/** @typedef {{ball:string,halfLength:number,halfWidth:number}} PitchConfig */
/** @typedef {{burgundy:number,gold:number,phase:string,started:number,previous:{x:number,y:number,z:number},anchor:{x:number,y:number,z:number}}} PitchState */
/** @param {import('zmap').ObjectValue} value @returns {PitchState} */
export const pitchState = (value) => /** @type {PitchState} */ (value);
/** @param {import('zmap').WorldObject} object @returns {PitchConfig} */
export const pitchConfig = (object) =>
  /** @type {PitchConfig} */ (object.config);
const point = (p) => ({ x: p.x, y: p.y, z: p.z });
const exact = (v, keys) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const position = (p) =>
  exact(p, ["x", "y", "z"]) &&
  Object.values(p).every((n) => Number.isFinite(n) && Math.abs(n) < 1000);
const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 999999;
/** @type {import('zmap').ObjectBehavior} */
export const soccerBehavior = {
  id: "soccer",
  version: 1,
  validateConfig(value, object, map) {
    const c = pitchConfig(object),
      ball = map.toys.find((t) => t.id === c.ball);
    if (
      !exact(value, ["ball", "halfLength", "halfWidth"]) ||
      !ball ||
      object.rotation !== 0 ||
      ![c.halfLength, c.halfWidth].every(
        (n) => Number.isFinite(n) && n >= 5 && n <= 30,
      ) ||
      ball.home.x !== object.position.x ||
      ball.home.z !== object.position.z ||
      ball.home.y !== object.position.y ||
      map.objects.filter(
        (o) => o.behavior === "soccer" && pitchConfig(o).ball === c.ball,
      ).length !== 1
    )
      throw Error("Invalid soccer pitch");
  },
  initialState(object) {
    return {
      burgundy: 0,
      gold: 0,
      phase: "play",
      started: 0,
      previous: point(object.position),
      anchor: point(object.position),
    };
  },
  validState(value, _object, _map, tick) {
    const s = pitchState(value);
    return !!(
      exact(s, [
        "burgundy",
        "gold",
        "phase",
        "started",
        "previous",
        "anchor",
      ]) &&
      count(s.burgundy) &&
      count(s.gold) &&
      ["play", "goal", "return"].includes(s.phase) &&
      Number.isSafeInteger(s.started) &&
      s.started >= 0 &&
      s.started <= tick &&
      position(s.previous) &&
      position(s.anchor)
    );
  },
  validEvent(event) {
    return (
      event.kind === "goal" &&
      exact(event.data, ["side"]) &&
      ["burgundy", "gold"].includes(event.data.side)
    );
  },
  step({ object, state, simulation, holdToy }) {
    const s = pitchState(state),
      c = pitchConfig(object),
      ball = simulation.toys[c.ball];
    s.previous = point(ball);
    if (s.phase === "play") return;
    const age = simulation.tick - s.started;
    if (s.phase === "goal" && age >= GOAL_HOLD_TICKS + GOAL_DISSOLVE_TICKS) {
      s.phase = "return";
      s.started = simulation.tick;
      s.anchor = point(object.position);
      Object.assign(ball, s.anchor, {
        vx: 0,
        vy: 0,
        vz: 0,
        teleportEpoch: (ball.teleportEpoch ?? 0) + 1,
      });
    } else if (s.phase === "return" && age >= BALL_RETURN_TICKS) {
      s.phase = "play";
      return;
    }
    holdToy(c.ball, s.anchor);
  },
  afterStep({ object, state, simulation, map, emit }) {
    const s = pitchState(state),
      c = pitchConfig(object),
      ball = simulation.toys[c.ball];
    if (s.phase !== "play") return;
    const r = map.toys.find((t) => t.id === c.ball).radius;
    const origin = object.position;
    // A goal requires the entire ball to cross the mouth, inside the posts and below the bar.
    for (const sign of [-1, 1]) {
      const line = origin.x + sign * (c.halfLength + 0.45 + r),
        from = (s.previous.x - line) * sign,
        to = (ball.x - line) * sign;
      if (from < 0 && to >= 0) {
        const fraction = -from / (to - from),
          z = s.previous.z + (ball.z - s.previous.z) * fraction,
          y = s.previous.y + (ball.y - s.previous.y) * fraction;
        if (
          Math.abs(z - origin.z) <= 2.34 - r &&
          y >= origin.y - 0.02 &&
          y + 2 * r <= origin.y + 2.3
        ) {
          const side = sign > 0 ? "burgundy" : "gold";
          s[side] = Math.min(999999, s[side] + 1);
          s.phase = "goal";
          s.started = simulation.tick;
          s.anchor = {
            x: origin.x + sign * (c.halfLength + 1.2),
            y: origin.y,
            z,
          };
          Object.assign(ball, s.anchor, { vx: 0, vy: 0, vz: 0 });
          emit("goal", { side });
          return;
        }
      }
    }
    const zLimit = c.halfWidth - r;
    if (Math.abs(ball.z - origin.z) > zLimit) {
      const sign = Math.sign(ball.z - origin.z);
      ball.z = origin.z + sign * zLimit;
      ball.vz = -sign * Math.abs(ball.vz) * 0.7;
    }
    const inMouth =
      Math.abs(ball.z - origin.z) <= 2.34 - r &&
      ball.y + 2 * r <= origin.y + 2.3;
    const xLimit = c.halfLength + (inMouth ? 1.75 : 0) - r;
    if (Math.abs(ball.x - origin.x) > xLimit) {
      const sign = Math.sign(ball.x - origin.x);
      ball.x = origin.x + sign * xLimit;
      ball.vx = -sign * Math.abs(ball.vx) * 0.7;
    }
  },
};
