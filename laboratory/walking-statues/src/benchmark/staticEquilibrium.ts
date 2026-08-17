import { lateralRopeParams } from "../control/ropeDefaults";
import { radToDeg } from "../core/orientation";
import { DEFAULT_REST_TOLERANCES, type RestTolerances } from "../diagnostics/tolerances";
import type { RapierModule } from "../physics/rapierSetup";
import { computeThresholds, type Thresholds } from "../physics/thresholds";
import { computeStatueGeometry } from "../statue/geometry";
import type { RoadParams } from "../road/types";
import type { StatueParams } from "../statue/types";
import { BenchmarkHarness } from "./harness";

export interface StaticEquilibriumConfig {
  statueParams: StatueParams;
  roadParams: RoadParams;
  /** Tension as a fraction of `min(F_slide, F_tip)`. Spec default 0.5. */
  tensionFraction: number;
  holdSeconds: number;
  tolerances: RestTolerances;
}

export interface EquilibriumCheck {
  name: string;
  measured: number;
  limit: number;
  unit: string;
  pass: boolean;
}

export interface StaticEquilibriumResult {
  pass: boolean;
  /** Measured, not assumed: read back from Rapier's own mass properties. */
  massKg: number;
  comHeightM: number;
  baseHalfWidthM: number;
  attachmentHeightM: number;
  frictionCoefficient: number;
  thresholds: Thresholds;
  appliedTensionN: number;
  tensionFraction: number;
  holdSeconds: number;
  contactCount: number;
  checks: EquilibriumCheck[];
  /** Set when the configuration has no finite tipping threshold (rocker base),
   * which makes the benchmark inapplicable rather than failed. */
  notApplicableReason?: string;
}

export const DEFAULT_STATIC_EQUILIBRIUM: Pick<StaticEquilibriumConfig, "tensionFraction" | "holdSeconds" | "tolerances"> = {
  tensionFraction: 0.5,
  holdSeconds: 5,
  tolerances: DEFAULT_REST_TOLERANCES
};

/**
 * The Static Equilibrium Benchmark.
 *
 * A0 flat base, flat road, zero initial velocity, one rope pulling at 50% of
 * `min(F_slide, F_tip)` for 5 s. The statue must not move, to quantified
 * tolerances.
 *
 * The rope is deliberately arranged **purely laterally** (haulers level with
 * and directly beside the attachment, so `d̂ = (0, ±1, 0)`), because that is
 * the arrangement the reference formulas `F_slide = μMg` and
 * `F_tip = Mgb/z_anchor` are derived for. Using the default angled haul
 * geometry here would compare a measurement against a threshold that does not
 * govern it — the rope's downward component raises the normal load and lowers
 * the tipping moment. `computeThresholds` reports the geometry-aware values for
 * angled ropes separately.
 *
 * The measurement window opens only after a 0.5 s unloaded settle, so gravity's
 * initial contact-resolution transient is not charged to the rope.
 */
export function runStaticEquilibriumBenchmark(
  RAPIER_MODULE: RapierModule,
  config: StaticEquilibriumConfig
): StaticEquilibriumResult {
  const geometry = computeStatueGeometry(config.statueParams);
  const attachment = geometry.defaultAttachment.left;

  // Build once with zero tension purely to read Rapier's own mass properties,
  // so thresholds use the simulated mass/COM rather than the requested ones.
  const probeRopes = lateralRopeParams(geometry, 0);
  const probe = new BenchmarkHarness(RAPIER_MODULE, {
    statueParams: config.statueParams,
    roadParams: config.roadParams,
    ropeParams: probeRopes,
    held: { leftHeld: false, rightHeld: false }
  });
  probe.settle(0.5);
  const massKg = probe.rigidBody.mass();
  const comHeightM = probe.rigidBody.worldCom().z;
  probe.dispose();

  const thresholds = computeThresholds({
    massKg,
    frictionCoefficient: config.roadParams.frictionCoefficient,
    contactHalfWidthY: geometry.base.contactHalfWidthY,
    contactKind: geometry.base.contactKind,
    attachmentHeightM: attachment.z,
    attachmentLateralM: attachment.y,
    direction: { x: 0, y: 1, z: 0 }
  });

  const appliedTensionN = config.tensionFraction * thresholds.fMinRefN;

  const base: Omit<StaticEquilibriumResult, "pass" | "checks" | "contactCount"> = {
    massKg,
    comHeightM,
    baseHalfWidthM: geometry.base.contactHalfWidthY,
    attachmentHeightM: attachment.z,
    frictionCoefficient: config.roadParams.frictionCoefficient,
    thresholds,
    appliedTensionN,
    tensionFraction: config.tensionFraction,
    holdSeconds: config.holdSeconds
  };

  if (thresholds.fTipRefN === null) {
    return {
      ...base,
      pass: false,
      checks: [],
      contactCount: 0,
      notApplicableReason:
        `Base family "${config.statueParams.baseFamily}" has ${geometry.base.contactKind} ground contact, ` +
        "so it has no finite tipping lever arm and no static tipping threshold. " +
        "The static equilibrium benchmark is defined for a flat-bottomed base (A0)."
    };
  }

  const harness = new BenchmarkHarness(RAPIER_MODULE, {
    statueParams: config.statueParams,
    roadParams: config.roadParams,
    ropeParams: lateralRopeParams(geometry, appliedTensionN),
    held: { leftHeld: true, rightHeld: false }
  });

  harness.settle(0.5);
  const before = harness.sample();
  harness.run(config.holdSeconds);
  const after = harness.sample();

  const displacementM = Math.hypot(after.com.x - before.com.x, after.com.y - before.com.y);
  const rollDeltaDeg = Math.abs(after.rollDeg - before.rollDeg);
  const speedMps = after.speedMps;
  const angularSpeedDegPerS = radToDeg(after.angularSpeedRadPerS);
  const contactCount = after.contactCount;

  harness.dispose();

  const t = config.tolerances;
  const checks: EquilibriumCheck[] = [
    { name: "Lateral/forward COM displacement", measured: displacementM, limit: t.displacementM, unit: "m", pass: displacementM < t.displacementM },
    { name: "Roll change", measured: rollDeltaDeg, limit: t.rollDeg, unit: "deg", pass: rollDeltaDeg < t.rollDeg },
    { name: "Linear speed after hold", measured: speedMps, limit: t.speedMps, unit: "m/s", pass: speedMps < t.speedMps },
    { name: "Angular speed after hold", measured: angularSpeedDegPerS, limit: t.angularSpeedDegPerS, unit: "deg/s", pass: angularSpeedDegPerS < t.angularSpeedDegPerS }
  ];

  return { ...base, pass: checks.every((c) => c.pass), checks, contactCount };
}
