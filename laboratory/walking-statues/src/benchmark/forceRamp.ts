import { lateralRopeParams } from "../control/ropeDefaults";
import { radToDeg } from "../core/orientation";
import { DEFAULT_REST_TOLERANCES, type RestTolerances } from "../diagnostics/tolerances";
import type { RapierModule } from "../physics/rapierSetup";
import { computeThresholds, staticTippingAngleRad, type Thresholds } from "../physics/thresholds";
import { computeStatueGeometry } from "../statue/geometry";
import type { RoadParams } from "../road/types";
import type { StatueParams } from "../statue/types";
import { BenchmarkHarness } from "./harness";

export type OnsetMode = "SLIDING" | "ROCKING";

/**
 * Discriminates rocking from sliding by asking how much of the observed COM
 * displacement the observed *rotation* already accounts for.
 *
 * A body rotating by `theta` about a stationary contact edge a distance
 * `r = hypot(b, z_com)` from its COM necessarily translates its COM by about
 * `r * theta`. So if rotation explains the displacement, the contact patch
 * stayed put and the motion was rocking; if there is displacement left
 * unexplained, the patch slipped.
 *
 * Comparing raw displacement against raw roll does not work: a statue that
 * topples fully translates its COM by metres *because* it rotated, which makes
 * a naive displacement test call every topple a slide.
 */
function classifyMotion(
  displacementM: number,
  rollDeltaDeg: number,
  pivotDistanceM: number,
  tippingAngleDeg: number | null
): OnsetMode {
  // Past the static tipping angle the COM has crossed the contact edge; there is
  // no restoring moment left and the outcome is unambiguously rotational.
  if (tippingAngleDeg !== null && rollDeltaDeg > tippingAngleDeg) return "ROCKING";

  const rotationExplainedM = (rollDeltaDeg * Math.PI) / 180 * pivotDistanceM;
  return rotationExplainedM >= 0.5 * displacementM ? "ROCKING" : "SLIDING";
}

export interface ForceRampConfig {
  statueParams: StatueParams;
  roadParams: RoadParams;
  /** Fractions of `min(F_slide, F_tip)` to test, ascending. */
  fractions: number[];
  /** Hold duration per trial, seconds. */
  holdSeconds: number;
  tolerances: RestTolerances;
}

export interface ForceRampPoint {
  fraction: number;
  tensionN: number;
  displacementM: number;
  rollDeltaDeg: number;
  speedMps: number;
  angularSpeedDegPerS: number;
  moved: boolean;
  mode: OnsetMode | null;
}

export interface ForceRampResult {
  thresholds: Thresholds;
  massKg: number;
  /** Static tipping angle of this geometry, deg; null for a rocker. */
  tippingAngleDeg: number | null;
  points: ForceRampPoint[];
  /** First tension at which motion exceeded the rest tolerances, or null if
   * the statue held at every tested level. */
  onsetTensionN: number | null;
  onsetFraction: number | null;
  onsetMode: OnsetMode | null;
  /** Onset as a fraction of the analytic prediction. 1.0 = exact agreement. */
  onsetVsPredicted: number | null;
}

export const DEFAULT_RAMP_FRACTIONS = [0.25, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.25];

/**
 * Force-ramp test: raise rope tension from 0 to 125% of the governing static
 * threshold and record the first level at which the statue genuinely moves,
 * then classify that onset as sliding or rocking.
 *
 * Each level is an **independent trial from a fresh reset**, not a continuous
 * ramp on one body. A continuous ramp would carry accumulated micro-motion and
 * stored elastic contact state from the sub-threshold levels into the
 * supra-threshold ones, blurring exactly the number this test exists to
 * measure.
 *
 * As with the static benchmark, the rope is arranged purely laterally so the
 * observed onset is directly comparable to `F_slide = μMg` and
 * `F_tip = Mgb/z_anchor`.
 */
export function runForceRamp(RAPIER_MODULE: RapierModule, config: ForceRampConfig): ForceRampResult {
  const geometry = computeStatueGeometry(config.statueParams);
  const attachment = geometry.defaultAttachment.left;

  const probe = new BenchmarkHarness(RAPIER_MODULE, {
    statueParams: config.statueParams,
    roadParams: config.roadParams,
    ropeParams: lateralRopeParams(geometry, 0),
    held: { leftHeld: false, rightHeld: false }
  });
  probe.settle(0.5);
  const massKg = probe.rigidBody.mass();
  const comHeightM = probe.rigidBody.worldCom().z;
  probe.dispose();

  const b = geometry.base.contactHalfWidthY;
  const pivotDistanceM = Math.hypot(b, comHeightM);
  const tippingAngleRad = staticTippingAngleRad(b, comHeightM, geometry.base.contactKind);
  const tippingAngleDeg = tippingAngleRad === null ? null : radToDeg(tippingAngleRad);

  const thresholds = computeThresholds({
    massKg,
    frictionCoefficient: config.roadParams.frictionCoefficient,
    contactHalfWidthY: geometry.base.contactHalfWidthY,
    contactKind: geometry.base.contactKind,
    attachmentHeightM: attachment.z,
    attachmentLateralM: attachment.y,
    direction: { x: 0, y: 1, z: 0 }
  });

  const points: ForceRampPoint[] = [];
  const t = config.tolerances;

  for (const fraction of config.fractions) {
    const tensionN = fraction * thresholds.fMinRefN;
    const harness = new BenchmarkHarness(RAPIER_MODULE, {
      statueParams: config.statueParams,
      roadParams: config.roadParams,
      ropeParams: lateralRopeParams(geometry, tensionN),
      held: { leftHeld: true, rightHeld: false }
    });

    harness.settle(0.5);
    const before = harness.sample();
    harness.run(config.holdSeconds);
    const after = harness.sample();
    harness.dispose();

    const displacementM = Math.hypot(after.com.x - before.com.x, after.com.y - before.com.y);
    const rollDeltaDeg = Math.abs(after.rollDeg - before.rollDeg);
    const speedMps = after.speedMps;
    const angularSpeedDegPerS = radToDeg(after.angularSpeedRadPerS);

    const moved =
      displacementM > t.displacementM ||
      rollDeltaDeg > t.rollDeg ||
      speedMps > t.speedMps ||
      angularSpeedDegPerS > t.angularSpeedDegPerS;

    const mode: OnsetMode | null = moved
      ? classifyMotion(displacementM, rollDeltaDeg, pivotDistanceM, tippingAngleDeg)
      : null;

    points.push({ fraction, tensionN, displacementM, rollDeltaDeg, speedMps, angularSpeedDegPerS, moved, mode });
  }

  const onset = points.find((p) => p.moved) ?? null;

  return {
    thresholds,
    massKg,
    tippingAngleDeg,
    points,
    onsetTensionN: onset?.tensionN ?? null,
    onsetFraction: onset?.fraction ?? null,
    onsetMode: onset?.mode ?? null,
    onsetVsPredicted: onset ? onset.tensionN / thresholds.fMinRefN : null
  };
}

export const DEFAULT_FORCE_RAMP: Pick<ForceRampConfig, "fractions" | "holdSeconds" | "tolerances"> = {
  fractions: DEFAULT_RAMP_FRACTIONS,
  holdSeconds: 3,
  tolerances: DEFAULT_REST_TOLERANCES
};
