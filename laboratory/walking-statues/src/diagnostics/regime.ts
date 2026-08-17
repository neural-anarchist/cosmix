import { radToDeg } from "../core/orientation";
import type { RegimeThresholds } from "./tolerances";

/**
 * What the statue is doing right now, in the order the checks are applied.
 *
 * - `AIRBORNE`  — no contact with the road at all.
 * - `TOPPLING`  — rolled past the angle where gravity stops restoring it.
 * - `ROCKING`   — in contact and rotating appreciably.
 * - `SLIDING`   — in contact, translating appreciably, not rotating much.
 * - `STICKING`  — a rope is pulling, and static friction is holding it.
 * - `REST`      — no load, no motion.
 *
 * This is an instantaneous kinematic classification, not the Phase 2/3 failure
 * taxonomy (no-motion / slip / lateral escape / fore-aft fall / numerical
 * warning), which needs run history rather than one frame. See PLAN.md.
 */
export type Regime = "REST" | "STICKING" | "SLIDING" | "ROCKING" | "TOPPLING" | "AIRBORNE";

export interface RegimeInput {
  contactCount: number;
  speedMps: number;
  angularSpeedRadPerS: number;
  rollDeg: number;
  appliedTensionN: number;
  /** Static tipping angle for this geometry in degrees, or null for a rocker. */
  tippingAngleDeg: number | null;
  thresholds: RegimeThresholds;
}

export function classifyRegime(input: RegimeInput): Regime {
  const { thresholds } = input;
  const angularSpeedDegPerS = radToDeg(input.angularSpeedRadPerS);

  if (input.contactCount === 0) return "AIRBORNE";

  const topplingRollDeg = input.tippingAngleDeg ?? thresholds.rockerTopplingRollDeg;
  if (Math.abs(input.rollDeg) > topplingRollDeg) return "TOPPLING";

  if (angularSpeedDegPerS > thresholds.rockingAngularSpeedDegPerS) return "ROCKING";
  if (input.speedMps > thresholds.slidingSpeedMps) return "SLIDING";

  return input.appliedTensionN > 0 ? "STICKING" : "REST";
}

export const REGIME_DESCRIPTION: Record<Regime, string> = {
  REST: "At rest, no rope load.",
  STICKING: "Rope loaded; static friction and the base's restoring moment are holding it.",
  SLIDING: "Translating across the road without appreciable rotation.",
  ROCKING: "Rotating about a contact edge or the rocker line.",
  TOPPLING: "Past the static tipping angle — gravity no longer restores it.",
  AIRBORNE: "No road contact."
};
