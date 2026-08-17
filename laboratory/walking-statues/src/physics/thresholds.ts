import { GRAVITY_M_S2 } from "../core/constants";
import type { Vec3 } from "../core/vec3";
import type { BaseContactKind } from "../statue/bases/types";

export type GoverningMode = "SLIDING" | "TIPPING";

export interface ThresholdInputs {
  massKg: number;
  frictionCoefficient: number;
  /** Restoring lever arm b: lateral half-width of the ground contact patch. */
  contactHalfWidthY: number;
  contactKind: BaseContactKind;
  /** Height of the rope attachment above the road, m. */
  attachmentHeightM: number;
  /** Signed lateral offset of the rope attachment from the centerline, m. */
  attachmentLateralM: number;
  /** Unit force direction of the active rope, or null if none is active. */
  direction: Vec3 | null;
}

export interface Thresholds {
  weightN: number;
  /**
   * Reference sliding threshold `F_slide = μ M g`, for a purely horizontal
   * lateral pull. Independent of where the rope is tied.
   */
  fSlideRefN: number;
  /**
   * Reference tipping threshold `F_tip = M g b / z_anchor`, for a purely
   * horizontal lateral pull at the attachment height. `null` for a rocker
   * base, which has line contact and therefore no finite lever arm `b` and
   * no static tipping threshold at all.
   */
  fTipRefN: number | null;
  /** `min(F_slide, F_tip)` — the force below which the statue must not move. */
  fMinRefN: number;
  /** Which failure the reference thresholds say comes first. */
  governingRef: GoverningMode;
  /**
   * Sliding threshold for the *actual* rope direction, accounting for the
   * rope's vertical component changing the normal load. `null` when no rope
   * direction is available, or when the geometry makes sliding unreachable at
   * any tension (a steeply downward pull can press harder than it drags).
   */
  fSlideGeomN: number | null;
  /**
   * Tipping threshold for the actual rope direction. `null` when no direction
   * is available, for a rocker base, or when the rope's line of action cannot
   * generate a net overturning moment about the contact edge at any tension.
   */
  fTipGeomN: number | null;
}

/**
 * Static thresholds for a flat-based statue under one rope.
 *
 * Two families of numbers are reported deliberately:
 *
 * - The **reference** thresholds are the textbook ones the project spec is
 *   written against, valid for a purely horizontal lateral pull. They are what
 *   the benchmark and force-ramp tests compare against, using a deliberately
 *   lateral rope arrangement so the comparison is exact.
 * - The **geometry-aware** thresholds apply the same force/moment balance to
 *   whatever direction the configured rope geometry actually produces. Once a
 *   rope has a vertical component these differ from the reference values, and
 *   reporting only the reference numbers alongside an angled rope would be
 *   quietly wrong.
 *
 * Both are surfaced in the diagnostics panel, labelled, rather than picking one
 * and hiding the discrepancy.
 */
export function computeThresholds(input: ThresholdInputs): Thresholds {
  const { massKg, frictionCoefficient: mu, contactHalfWidthY: b, attachmentHeightM: zA } = input;
  const weightN = massKg * GRAVITY_M_S2;

  const fSlideRefN = mu * weightN;
  const hasEdge = input.contactKind === "flat" && b > 0 && zA > 0;
  const fTipRefN = hasEdge ? (weightN * b) / zA : null;

  const fMinRefN = fTipRefN === null ? fSlideRefN : Math.min(fSlideRefN, fTipRefN);
  const governingRef: GoverningMode =
    fTipRefN !== null && fTipRefN < fSlideRefN ? "TIPPING" : "SLIDING";

  let fSlideGeomN: number | null = null;
  let fTipGeomN: number | null = null;

  const d = input.direction;
  if (d) {
    // --- Sliding: horizontal drag vs friction on a normal load the rope's
    // own vertical component modifies.  N = Mg - T*dz
    // slide when  T*h >= mu*(Mg - T*dz)  =>  T*(h + mu*dz) >= mu*Mg
    const h = Math.hypot(d.x, d.y);
    const slideDenom = h + mu * d.z;
    if (slideDenom > 1e-9) fSlideGeomN = (mu * weightN) / slideDenom;

    // --- Tipping about the contact edge the lateral component pushes toward.
    // Mirror the problem so the pull is toward +y, then take moments about the
    // x-axis line through (y = +b, z = 0), positive in the tipping sense:
    //   M_tip = Fy*z_p - Fz*(y_p - b)
    // Weight contributes -Mg*b (restoring). Tipping when the rope's
    // contribution exceeds it.
    if (hasEdge && Math.abs(d.y) > 1e-9) {
      const s = Math.sign(d.y);
      const yA = s * input.attachmentLateralM; // mirrored attachment offset
      const tipDenom = Math.abs(d.y) * zA - d.z * (yA - b);
      if (tipDenom > 1e-9) fTipGeomN = (weightN * b) / tipDenom;
    }
  }

  return {
    weightN,
    fSlideRefN,
    fTipRefN,
    fMinRefN,
    governingRef,
    fSlideGeomN,
    fTipGeomN
  };
}

/**
 * Static tipping angle for a flat-bottomed base rotating about its contact
 * edge: once the COM passes over the edge there is no restoring moment left.
 * `theta_crit = atan(b / z_com)`. Returns null for a rocker.
 */
export function staticTippingAngleRad(contactHalfWidthY: number, comHeightM: number, contactKind: BaseContactKind): number | null {
  if (contactKind !== "flat" || contactHalfWidthY <= 0 || comHeightM <= 0) return null;
  return Math.atan(contactHalfWidthY / comHeightM);
}
