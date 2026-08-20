/**
 * A one-dimensional bracket-and-bisect solver, used to hit a geometric target
 * by adjusting a single normalized base parameter.
 *
 * Deliberately numeric rather than algebraic. Twelve families derive their
 * volume and height from their shape in twelve different ways — a prism's
 * volume is linear in its length, an ellipsoidal rocker's height is a quotient
 * of its width and curvature, a fore-aft rocker's volume is neither — and
 * hand-deriving an inverse for each would be twelve chances to be subtly wrong
 * in a way that still produced plausible numbers. Solving against the family's
 * own `dims()` cannot disagree with the geometry it is solving for.
 *
 * The result carries whether it converged, so a lock that cannot be met inside
 * the parameter's supported range is reported as unmet rather than clamped.
 */
export interface SolveResult {
  value: number;
  achieved: number;
  converged: boolean;
  /** Set when the target lies outside what the parameter range can produce. */
  outOfRange?: { min: number; max: number };
}

export function solveMonotonic(
  evaluate: (parameter: number) => number,
  target: number,
  range: { min: number; max: number },
  tolerance: number,
  iterations = 80
): SolveResult {
  const atMin = evaluate(range.min);
  const atMax = evaluate(range.max);

  const lo = Math.min(atMin, atMax);
  const hi = Math.max(atMin, atMax);
  if (target < lo - tolerance || target > hi + tolerance) {
    // The family simply cannot produce this value anywhere in the parameter's
    // supported range. Clamping to the nearest endpoint would silently hand
    // back a mismatched geometry labelled "matched".
    const best = Math.abs(atMin - target) < Math.abs(atMax - target) ? range.min : range.max;
    return {
      value: best,
      achieved: evaluate(best),
      converged: false,
      outOfRange: { min: lo, max: hi }
    };
  }

  const increasing = atMax >= atMin;
  let low = range.min;
  let high = range.max;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const value = evaluate(mid);
    if (Math.abs(value - target) <= tolerance) {
      return { value: mid, achieved: value, converged: true };
    }
    if (increasing === value < target) low = mid;
    else high = mid;
  }

  const mid = (low + high) / 2;
  const achieved = evaluate(mid);
  return { value: mid, achieved, converged: Math.abs(achieved - target) <= tolerance };
}

/**
 * Distance from `origin` to the boundary of an axis-aligned box along `direction`.
 *
 * Used to find how far ballast can be displaced from the statue's own centre of
 * mass before it would leave the body. Returns 0 when the origin is already
 * outside, which the caller treats as a rejection rather than as a small
 * distance.
 */
export function distanceToBoxBoundary(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
): number {
  const axes = ["x", "y", "z"] as const;
  for (const axis of axes) {
    if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return 0;
  }

  let limit = Infinity;
  for (const axis of axes) {
    const d = direction[axis];
    if (Math.abs(d) < 1e-15) continue;
    const bound = d > 0 ? box.max[axis] : box.min[axis];
    limit = Math.min(limit, (bound - origin[axis]) / d);
  }
  return Number.isFinite(limit) ? Math.max(0, limit) : 0;
}
