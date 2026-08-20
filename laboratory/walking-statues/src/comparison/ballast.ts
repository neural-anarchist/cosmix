import { length, sub, type Vec3 } from "../core/vec3";
import type { BallastSpec } from "../statue/types";

/**
 * The largest fraction of the statue's total mass that may be ballast.
 *
 * Past this the "statue" is mostly counterweight, and a comparison between two
 * such bodies is comparing ballast placements rather than shapes. Rejecting is
 * more useful than producing a technically-matched body nobody should trust.
 */
export const MAX_BALLAST_FRACTION = 0.5;

/** Keeps the ballast strictly inside the body rather than exactly on its
 * surface, so a rounding error cannot put it outside the material it models. */
const ENVELOPE_MARGIN = 0.97;

/** Resolution of the march that finds how far ballast can travel from the
 * statue's centre of mass and still be inside it. 1 mm on a 3.5 m body. */
const REACH_STEP_M = 1e-3;

/**
 * How far a point can move from `origin` along `direction` and remain inside the
 * body, marching outward and stopping at the first step that leaves it.
 *
 * Marching rather than solving analytically because the body is a union of a
 * base, a torso and a head — not a convex region — so a ray can leave it and
 * re-enter. Only the *continuous* reach from the centre of mass is usable: a
 * position beyond a gap would be inside some component but separated from the
 * rest, which is not what "internal ballast" means.
 */
function reachInsideBody(
  origin: Vec3,
  direction: Vec3,
  contains: (point: Vec3) => boolean,
  limit: number
): number {
  if (!contains(origin)) return 0;
  let travelled = 0;
  while (travelled + REACH_STEP_M <= limit) {
    const next = travelled + REACH_STEP_M;
    const point = {
      x: origin.x + direction.x * next,
      y: origin.y + direction.y * next,
      z: origin.z + direction.z * next
    };
    if (!contains(point)) break;
    travelled = next;
  }
  return travelled;
}

export interface BallastSolution {
  ok: true;
  /** Null when the geometry already sits at the target and no ballast is needed. */
  ballast: BallastSpec | null;
  /** Mass the geometry itself must carry, so geometry + ballast hits the target. */
  geometryMassKg: number;
  massFraction: number;
}

export interface BallastRejection {
  ok: false;
  reason: string;
}

/**
 * Places an internal ballast mass so that geometry-plus-ballast lands on a
 * target total mass and centre of mass.
 *
 * The algebra is short and worth stating, because it explains why some targets
 * are simply unreachable. With total mass `M`, ballast fraction `f = m_b/M`, and
 * the geometry's own centre of mass `c_g`:
 *
 *     M c = M(1-f) c_g + M f p_b     =>     p_b = c_g + (c - c_g) / f
 *
 * The ballast's offset from the geometry's centre of mass is the requested COM
 * shift *divided* by the ballast fraction. A small ballast must therefore sit
 * far away, and there is a hard floor on `f` set by how far the body extends in
 * that direction. Below it the ballast would have to be outside the statue,
 * which is not a small approximation but a different object.
 *
 * The smallest workable fraction is chosen deliberately: it disturbs the
 * geometry's own mass the least, leaving as much of the body as possible the
 * shape it claims to be.
 */
export function solveBallast(options: {
  targetTotalMassKg: number;
  targetComLocal: Vec3;
  geometryComLocal: Vec3;
  /** True when a body-local point is inside the statue's own material. */
  containsPoint: (point: Vec3) => boolean;
  /** Bounding box of the body, used only to bound the outward march. */
  envelope: { min: Vec3; max: Vec3 };
  comToleranceM: number;
}): BallastSolution | BallastRejection {
  const { targetTotalMassKg, targetComLocal, geometryComLocal, containsPoint, envelope, comToleranceM } =
    options;

  if (!(targetTotalMassKg > 0)) {
    return { ok: false, reason: `Target total mass must be positive; got ${targetTotalMassKg} kg.` };
  }

  const shift = sub(targetComLocal, geometryComLocal);
  const distance = length(shift);

  if (distance <= comToleranceM) {
    // The shape already sits where it is being asked to sit. Adding ballast to
    // move it nowhere would be noise dressed as normalization.
    return { ok: true, ballast: null, geometryMassKg: targetTotalMassKg, massFraction: 0 };
  }

  const direction = { x: shift.x / distance, y: shift.y / distance, z: shift.z / distance };
  const span = Math.hypot(
    envelope.max.x - envelope.min.x,
    envelope.max.y - envelope.min.y,
    envelope.max.z - envelope.min.z
  );
  const reach = reachInsideBody(geometryComLocal, direction, containsPoint, span) * ENVELOPE_MARGIN;

  if (reach <= 0) {
    return {
      ok: false,
      reason:
        "The statue's own centre of mass does not lie inside its own material — for a shape like a " +
        "cylindrical rocker with a narrow torso this can happen — so no interior ballast position exists " +
        "along the required direction."
    };
  }

  const fraction = distance / reach;
  if (fraction > MAX_BALLAST_FRACTION) {
    return {
      ok: false,
      reason:
        `Moving the centre of mass by ${(distance * 1000).toFixed(1)} mm would need ballast of at least ` +
        `${(fraction * 100).toFixed(1)}% of total mass placed ${(reach * 1000).toFixed(1)} mm away — the ` +
        `furthest point still inside the statue's own material along that direction. The limit is ` +
        `${(MAX_BALLAST_FRACTION * 100).toFixed(0)}%, past which the body is mostly counterweight and a ` +
        "comparison between two such bodies compares ballast placements rather than shapes. " +
        "Move the target COM closer to this family's own, or compare a family whose COM is nearer it."
    };
  }

  const massKg = fraction * targetTotalMassKg;
  const geometryMassKg = targetTotalMassKg - massKg;
  if (!(geometryMassKg > 0)) {
    return { ok: false, reason: "Ballast would consume the entire mass budget, leaving the geometry massless." };
  }

  const localPosition: Vec3 = {
    x: geometryComLocal.x + shift.x / fraction,
    y: geometryComLocal.y + shift.y / fraction,
    z: geometryComLocal.z + shift.z / fraction
  };

  return {
    ok: true,
    ballast: {
      massKg,
      localPosition,
      reason:
        `Matched-comparison COM lock: ${massKg.toFixed(1)} kg (${(fraction * 100).toFixed(1)}% of total) ` +
        `placed inside the body to move the centre of mass ${(distance * 1000).toFixed(2)} mm.`
    },
    geometryMassKg,
    massFraction: fraction
  };
}
