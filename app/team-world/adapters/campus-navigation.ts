import {
  findWalkPath,
  type Vec3,
  type WorldMap,
  type NavigationOptions,
} from "zmap";

/** Search the visible trip's neighbourhood instead of sampling the entire campus.
 * Surfaces keep their original coordinates and heights, including overlapping
 * bridge layers. Every returned segment is still checked by ZMap's collision API.
 */
export function campusPath(
  map: WorldMap,
  from: Vec3,
  to: Vec3,
  options: NavigationOptions = {},
) {
  const margin = 8;
  const x = Math.max(map.bounds.x, Math.min(from.x, to.x) - margin);
  const z = Math.max(map.bounds.z, Math.min(from.z, to.z) - margin);
  const right = Math.min(
    map.bounds.x + map.bounds.width,
    Math.max(from.x, to.x) + margin,
  );
  const bottom = Math.min(
    map.bounds.z + map.bounds.depth,
    Math.max(from.z, to.z) + margin,
  );
  if (right <= x || bottom <= z)
    return { status: "unreachable" as const, points: [], visited: 0 };
  const local = {
    ...map,
    bounds: { x, z, width: right - x, depth: bottom - z },
    surfaces: map.surfaces.filter(
      (s) =>
        s.x < right && s.x + s.width > x && s.z < bottom && s.z + s.depth > z,
    ),
  };
  return findWalkPath(local, from, to, {
    ...options,
    spacing: 0.8,
    maxNodes: 100000,
  });
}
