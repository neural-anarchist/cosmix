import { rotateByQuat, type Quat, type Vec3 } from "../core/vec3";
import { basePlanOutline } from "./bases/planOutline";
import type { Vec2 } from "./bases/polytope";
import type { StatueGeometry } from "./geometry";
import type { StatueParams } from "./types";

/**
 * Tests whether a body-local point lies inside the statue itself — inside the
 * base, the torso or the head, not merely inside the box that encloses all
 * three.
 *
 * The distinction is not academic. The statue is a wide base under a much
 * narrower torso, so its bounding box is mostly empty air: at shoulder height a
 * point 0.37 m off-axis sits inside the box and 0.09 m outside any actual
 * material. Matched-comparison ballast is required to be *inside the body*, and
 * a containment test that accepted the bounding box would let it be placed in
 * the air beside the statue while reporting that it was internal.
 */
export function bodyContainsPoint(
  params: StatueParams,
  geometry: StatueGeometry,
  point: Vec3
): boolean {
  return (
    insideBase(params, geometry, point) ||
    insideBox(point, geometry.torsoPlacement.position, geometry.torsoPlacement.rotation, {
      x: geometry.torso.depthX / 2,
      y: geometry.torso.widthY / 2,
      z: geometry.torso.heightZ / 2
    }) ||
    insideSphere(point, geometry.headPlacement.position, geometry.head.radius)
  );
}

function insideBase(params: StatueParams, geometry: StatueGeometry, point: Vec3): boolean {
  const base = geometry.base;
  if (point.z < 0 || point.z > base.topZ) return false;

  if (base.contactKind === "rocker") {
    // A rocker's cross-section varies along its length; its plan silhouette is
    // used as a stand-in, which over-accepts near the curved underside. Stated
    // rather than silently relied upon — ballast for the rocker families sits
    // near the centreline in practice, where the approximation is tight.
    return (
      point.x >= base.minX && point.x <= base.maxX && point.y >= base.minY && point.y <= base.maxY
    );
  }

  return pointInConvexPolygon({ x: point.x, y: point.y }, basePlanOutline(params).outline);
}

function insideBox(point: Vec3, centre: Vec3, rotation: Quat, half: Vec3): boolean {
  const relative = { x: point.x - centre.x, y: point.y - centre.y, z: point.z - centre.z };
  const inverse: Quat = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
  const local = rotateByQuat(relative, inverse);
  return Math.abs(local.x) <= half.x && Math.abs(local.y) <= half.y && Math.abs(local.z) <= half.z;
}

function insideSphere(point: Vec3, centre: Vec3, radius: number): boolean {
  return Math.hypot(point.x - centre.x, point.y - centre.y, point.z - centre.z) <= radius;
}

/** Counter-clockwise convex polygon containment. */
export function pointInConvexPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) < -1e-12) return false;
  }
  return true;
}
