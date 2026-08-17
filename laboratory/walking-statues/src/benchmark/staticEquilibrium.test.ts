import { beforeAll, describe, expect, it } from "vitest";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { DEFAULT_ROAD_PARAMS } from "../state/store";
import { PHASE1_BASELINE_STATUE_PARAMS } from "../statue/defaults";
import { lateralRopeParams } from "../control/ropeDefaults";
import { computeStatueGeometry } from "../statue/geometry";
import { computeThresholds } from "../physics/thresholds";
import { DEFAULT_REST_TOLERANCES } from "../diagnostics/tolerances";
import { BenchmarkHarness } from "./harness";
import { DEFAULT_STATIC_EQUILIBRIUM, runStaticEquilibriumBenchmark } from "./staticEquilibrium";
import { DEFAULT_FORCE_RAMP, runForceRamp } from "./forceRamp";

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await getRapier();
}, 30_000);

const A0_ROAD = { ...DEFAULT_ROAD_PARAMS };
// Pinned to the frozen Phase 1 baseline, not to DEFAULT_STATUE_PARAMS: defaults
// are allowed to evolve with the statue model, but what these tests certify is
// the exact configuration the Phase 1 results were validated against.
const A0_STATUE = { ...PHASE1_BASELINE_STATUE_PARAMS, baseFamily: "A0" as const };

describe("static equilibrium benchmark", () => {
  it(
    "holds a sub-threshold pull at rest within tolerance (regression for the force-latch bug)",
    () => {
      const result = runStaticEquilibriumBenchmark(RAPIER, {
        statueParams: A0_STATUE,
        roadParams: A0_ROAD,
        ...DEFAULT_STATIC_EQUILIBRIUM
      });

      expect(result.notApplicableReason).toBeUndefined();
      // Sanity: the benchmark must actually be pulling, and pulling below both
      // thresholds. A silently-zero tension would pass the rest checks
      // vacuously.
      expect(result.appliedTensionN).toBeGreaterThan(1000);
      expect(result.appliedTensionN).toBeLessThan(result.thresholds.fMinRefN);
      expect(result.contactCount).toBeGreaterThan(0);

      for (const check of result.checks) {
        expect(check.pass, `${check.name}: ${check.measured} ${check.unit} exceeds ${check.limit}`).toBe(true);
      }
      expect(result.pass).toBe(true);
    },
    30_000
  );

  it(
    "still holds with linear and angular damping set to zero — damping is not what produces equilibrium",
    () => {
      // The whole point of the Phase 1 correction was that static equilibrium
      // comes from the contact solver, not from velocity damping quietly
      // absorbing an over-applied force. Asserting that here rather than in a
      // throwaway probe means a future change to the mass/damping model cannot
      // silently start leaning on damping again.
      const result = runStaticEquilibriumBenchmark(RAPIER, {
        statueParams: { ...A0_STATUE, linearDampingSI: 0, angularDampingSI: 0 },
        roadParams: A0_ROAD,
        ...DEFAULT_STATIC_EQUILIBRIUM
      });

      expect(result.notApplicableReason).toBeUndefined();
      expect(result.appliedTensionN).toBeGreaterThan(1000);
      for (const check of result.checks) {
        expect(check.pass, `${check.name}: ${check.measured} ${check.unit} exceeds ${check.limit}`).toBe(true);
      }
      expect(result.pass).toBe(true);
    },
    30_000
  );

  it("reports the benchmark as not applicable for a rocker base rather than failing it", () => {
    const result = runStaticEquilibriumBenchmark(RAPIER, {
      statueParams: { ...PHASE1_BASELINE_STATUE_PARAMS, baseFamily: "A4" },
      roadParams: A0_ROAD,
      ...DEFAULT_STATIC_EQUILIBRIUM
    });
    expect(result.notApplicableReason).toBeDefined();
    expect(result.thresholds.fTipRefN).toBeNull();
  });

  it(
    "does NOT hold when the force latch is left un-reset — proves the test has teeth",
    () => {
      // Reproduces the original defect by bypassing applyRopeForces: add the
      // same force every step without resetting Rapier's latch. If this ever
      // stops diverging, the regression test above has stopped being meaningful.
      const geometry = computeStatueGeometry(A0_STATUE);
      const thresholds = computeThresholds({
        massKg: A0_STATUE.totalMassKg,
        frictionCoefficient: A0_ROAD.frictionCoefficient,
        contactHalfWidthY: geometry.base.contactHalfWidthY,
        contactKind: geometry.base.contactKind,
        attachmentHeightM: geometry.defaultAttachment.left.z,
        attachmentLateralM: geometry.defaultAttachment.left.y,
        direction: { x: 0, y: 1, z: 0 }
      });
      const tensionN = 0.5 * thresholds.fMinRefN;

      const harness = new BenchmarkHarness(RAPIER, {
        statueParams: A0_STATUE,
        roadParams: A0_ROAD,
        ropeParams: lateralRopeParams(geometry, tensionN),
        held: { leftHeld: true, rightHeld: false }
      });
      harness.settle(0.5);
      const before = harness.sample();

      for (let i = 0; i < 240 * 2; i++) {
        const ropes = harness.solveRopesNow();
        // deliberately NO resetForces/resetTorques
        harness.rigidBody.addForceAtPoint(ropes.left.force, ropes.left.attachmentWorld, true);
        harness.world.step();
      }
      const after = harness.sample();
      const displacementM = Math.hypot(after.com.x - before.com.x, after.com.y - before.com.y);
      harness.dispose();

      expect(displacementM).toBeGreaterThan(DEFAULT_REST_TOLERANCES.displacementM * 100);
    },
    30_000
  );
});

describe("force ramp", () => {
  it(
    "finds a reproducible onset that agrees with the analytic threshold",
    () => {
      const result = runForceRamp(RAPIER, {
        statueParams: A0_STATUE,
        roadParams: A0_ROAD,
        ...DEFAULT_FORCE_RAMP
      });

      expect(result.onsetTensionN).not.toBeNull();
      // Onset must land near the predicted governing threshold, and must not
      // occur at the very lowest tested level (which would mean it never held).
      expect(result.onsetFraction).toBeGreaterThan(0.9);
      expect(result.onsetFraction).toBeLessThanOrEqual(1.1);
      expect(result.onsetVsPredicted).toBeGreaterThan(0.9);
      expect(result.onsetVsPredicted).toBeLessThanOrEqual(1.1);

      // Every level below onset must have held, and every level above must move:
      // a threshold, not a scatter of pass/fail.
      const onsetIndex = result.points.findIndex((p) => p.moved);
      expect(result.points.slice(0, onsetIndex).every((p) => !p.moved)).toBe(true);
      expect(result.points.slice(onsetIndex).every((p) => p.moved)).toBe(true);
    },
    120_000
  );

  it(
    "onsets by ROCKING when friction is high enough that F_tip < F_slide",
    () => {
      const result = runForceRamp(RAPIER, {
        statueParams: A0_STATUE,
        roadParams: { ...A0_ROAD, frictionCoefficient: 1.2 },
        ...DEFAULT_FORCE_RAMP,
        fractions: [0.9, 0.95, 1.0, 1.1]
      });
      expect(result.thresholds.governingRef).toBe("TIPPING");
      expect(result.onsetMode).toBe("ROCKING");
    },
    120_000
  );

  it(
    "onsets by SLIDING when friction is low enough that F_slide < F_tip",
    () => {
      const result = runForceRamp(RAPIER, {
        statueParams: A0_STATUE,
        roadParams: { ...A0_ROAD, frictionCoefficient: 0.12 },
        ...DEFAULT_FORCE_RAMP,
        fractions: [0.9, 0.95, 1.0, 1.1]
      });
      expect(result.thresholds.governingRef).toBe("SLIDING");
      expect(result.onsetMode).toBe("SLIDING");
    },
    120_000
  );
});
