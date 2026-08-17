import { beforeAll, describe, expect, it } from "vitest";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { defaultRopeParams } from "../control/ropeDefaults";
import { mirrorRopeGeometry, type RopeParams } from "../control/ropeModel";
import { computeStatueGeometry } from "../statue/geometry";
import { computeThresholds } from "../physics/thresholds";
import { DEFAULT_ROAD_PARAMS } from "../state/store";
import { PHASE1_BASELINE_STATUE_PARAMS } from "../statue/defaults";
import { BenchmarkHarness, type HarnessSample } from "./harness";

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await getRapier();
}, 30_000);

const STATUE = { ...PHASE1_BASELINE_STATUE_PARAMS, baseFamily: "A0" as const };
const ROAD = { ...DEFAULT_ROAD_PARAMS };

/**
 * Rope forces and torques are read straight off the pose, so they mirror an
 * order of magnitude more tightly than the trajectory does: measured 3e-5
 * relative early in the pull, degrading to 1.0e-3 by 2.25 s as the statue rolls
 * past 20 deg and the pose asymmetry below grows. They are not bit-exact both
 * because Rapier reports poses as f32 and because that trajectory asymmetry
 * feeds back into the rope direction.
 *
 * Asserted relative to each quantity's own scale (~10^4 N, ~10^4 N·m) rather
 * than against an absolute epsilon, which would be testing float precision
 * rather than symmetry.
 */
const MIRROR_FORCE_REL_TOL = 5e-3;

function expectRelClose(actual: number, expected: number, scale: number, tag: string): void {
  expect(Math.abs(actual - expected) / Math.max(Math.abs(scale), 1e-9), tag).toBeLessThan(
    MIRROR_FORCE_REL_TOL
  );
}

/**
 * Trajectories mirror only to about 1%, not to float precision, and the reason
 * is Rapier's solver rather than the rope model: its contact-constraint
 * iteration order is fixed in world space and is not itself symmetric under
 * y -> -y, which biases the two runs by a small roughly-constant offset.
 *
 * Measured on the default statue at 1.4x the tipping threshold: the relative
 * mirror error *shrinks* from 2.6% at 0.25 s to 0.6% at 2.5 s as the motion
 * grows, which is the signature of a fixed offset rather than of divergence.
 * Removing the unloaded settle makes it worse (5.1% -> 1.2%), so the settle is
 * not the cause. 5% is a deliberately generous bound on the measured 2.6% peak.
 *
 * This is a documented numerical limitation, not a masked defect: forces and
 * torques, which are read straight off the pose rather than integrated through
 * the solver, still mirror an order of magnitude more tightly (see
 * MIRROR_FORCE_REL_TOL).
 */
const MIRROR_TRAJECTORY_REL_TOL = 0.05;
/** Below these magnitudes the signal is at the solver's noise floor and a
 * relative comparison is meaningless; the absolute bound is checked instead. */
const SIGNAL_FLOOR_M = 1e-3;
const SIGNAL_FLOOR_DEG = 0.05;

/**
 * Compares a solver-integrated quantity between the two runs.
 *
 * `flip` is true for quantities that reverse under a y-mirror (lateral
 * displacement, roll) and false for those that do not (fore-aft, vertical).
 *
 * The error is always judged against `scale`, the magnitude of the *primary
 * driven motion* in the same units, rather than against the component's own
 * magnitude. That matters for the fore-aft and vertical components: with a
 * symmetric base on a flat road the statue barely advances at all (measured
 * 0.15 mm of dx against 0.63 m of dy), so a self-relative test on dx would be
 * reporting the ratio of two near-zero numbers. Measured against the primary
 * scale, every component mirrors to within 0.1%.
 */
function expectMirroredTrajectory(
  actual: number,
  reference: number,
  scale: number,
  flip: boolean,
  tag: string
): void {
  const expected = flip ? -reference : reference;
  expect(Math.abs(actual - expected) / scale, `${tag} vs primary scale`).toBeLessThan(
    MIRROR_TRAJECTORY_REL_TOL
  );
  // Direction must be right too, once the signal clears the noise floor.
  if (Math.abs(expected) > scale * MIRROR_TRAJECTORY_REL_TOL) {
    expect(Math.sign(actual), `${tag} sign`).toBe(Math.sign(expected));
  }
}

/** Runs a single-rope pull and records a trajectory, sampled every 0.25 s. */
function runPull(ropeParams: RopeParams, side: "left" | "right", seconds: number): HarnessSample[] {
  const harness = new BenchmarkHarness(RAPIER, {
    statueParams: STATUE,
    roadParams: ROAD,
    ropeParams,
    held: { leftHeld: side === "left", rightHeld: side === "right" }
  });
  harness.settle(0.5);

  const samples: HarnessSample[] = [harness.sample()];
  const chunks = Math.round(seconds / 0.25);
  for (let i = 0; i < chunks; i++) {
    harness.run(0.25);
    samples.push(harness.sample());
  }
  harness.dispose();
  return samples;
}

describe("mirror symmetry of the rope model", () => {
  it("derives force direction from geometry, not a hardcoded axis", () => {
    const geometry = computeStatueGeometry(STATUE);
    const params = defaultRopeParams(geometry, 5000);

    const harness = new BenchmarkHarness(RAPIER, {
      statueParams: STATUE,
      roadParams: ROAD,
      ropeParams: params,
      held: { leftHeld: true, rightHeld: false }
    });
    const baseline = harness.solveRopesNow().left;

    // The default haul geometry must produce a genuinely three-dimensional
    // pull: lateral-dominant, with real forward and vertical components. The
    // old model could only ever produce (0, ±F, 0).
    expect(Math.abs(baseline.direction.y)).toBeGreaterThan(0.5);
    expect(baseline.direction.x).toBeGreaterThan(0.2);
    expect(baseline.direction.z).toBeLessThan(-0.2);
    expect(Math.hypot(baseline.direction.x, baseline.direction.y, baseline.direction.z)).toBeCloseTo(1, 10);

    // Moving the puller must change the force direction accordingly.
    harness.ropeParams = {
      ...params,
      left: { ...params.left, externalAnchor: { ...params.left.externalAnchor, x: -8 } }
    };
    const movedBack = harness.solveRopesNow().left;
    expect(movedBack.direction.x).toBeLessThan(0);
    expect(baseline.direction.x).toBeGreaterThan(0);

    harness.ropeParams = {
      ...params,
      left: { ...params.left, externalAnchor: { ...params.left.externalAnchor, z: 12 } }
    };
    const movedUp = harness.solveRopesNow().left;
    expect(movedUp.direction.z).toBeGreaterThan(0);

    harness.dispose();
  });

  it("applies force at the attachment, producing the analytic torque about the COM", () => {
    const geometry = computeStatueGeometry(STATUE);
    // Purely lateral pull so the expected torque is trivially checkable by hand.
    const tensionN = 3000;
    const attachment = geometry.defaultAttachment.left;
    const params: RopeParams = {
      tensionN,
      left: {
        attachmentLocal: attachment,
        externalAnchor: { x: attachment.x, y: attachment.y + 5, z: attachment.z }
      },
      right: {
        attachmentLocal: geometry.defaultAttachment.right,
        externalAnchor: { x: 0, y: -5, z: attachment.z }
      }
    };

    const harness = new BenchmarkHarness(RAPIER, {
      statueParams: STATUE,
      roadParams: ROAD,
      ropeParams: params,
      held: { leftHeld: true, rightHeld: false }
    });
    harness.settle(0.5);
    const solution = harness.solveRopesNow().left;
    const comZ = harness.rigidBody.worldCom().z;
    harness.dispose();

    expect(solution.direction.y).toBeCloseTo(1, 6);
    expect(solution.force.y).toBeCloseTo(tensionN, 3);

    // tau = (r_anchor - r_COM) x F. With r_x = 0 and F essentially (0, T, 0)
    // this is a pure roll moment tau_x = -(z_a - z_com) * F_y.
    // The world attachment sits ~22 um below the local one once the body settles
    // into its resting contact penetration, so the moment arm is taken from the
    // world attachment, and F_y from the solved force rather than the nominal
    // tension (the settle tilts d-hat off exact lateral by ~1e-5).
    const attachWorldZ = solution.attachmentWorld.z;
    expect(attachWorldZ).toBeCloseTo(attachment.z, 3); // settled, not moved
    const expectedTauX = -(attachWorldZ - comZ) * solution.force.y;
    // Rapier reports poses in f32, so compare relatively rather than to an
    // absolute epsilon on a ~2.4e3 magnitude.
    expect(Math.abs((solution.torqueAboutCom.x - expectedTauX) / expectedTauX)).toBeLessThan(1e-5);
    // Pure roll moment: the other two components are zero to within the pose's
    // f32 resolution, so they are checked relative to the roll component rather
    // than against an absolute epsilon.
    const tauScale = Math.abs(solution.torqueAboutCom.x);
    expect(Math.abs(solution.torqueAboutCom.y) / tauScale).toBeLessThan(1e-5);
    expect(Math.abs(solution.torqueAboutCom.z) / tauScale).toBeLessThan(1e-5);

    // And the same number from the hand formula, to 0.1%.
    const handTauX = -(attachment.z - comZ) * tensionN;
    expect(Math.abs((solution.torqueAboutCom.x - handTauX) / handTauX)).toBeLessThan(1e-3);
    // Non-trivial magnitude, so a silently-zero moment arm can't pass.
    expect(Math.abs(handTauX)).toBeGreaterThan(100);
  });

  it(
    "produces mirror-symmetric trajectories for mirrored left and right pulls",
    () => {
      const geometry = computeStatueGeometry(STATUE);
      // Above threshold, so there is real motion to compare rather than two
      // flat lines at zero.
      const thresholds = computeThresholds({
        massKg: STATUE.totalMassKg,
        frictionCoefficient: ROAD.frictionCoefficient,
        contactHalfWidthY: geometry.base.contactHalfWidthY,
        contactKind: geometry.base.contactKind,
        attachmentHeightM: geometry.defaultAttachment.left.z,
        attachmentLateralM: geometry.defaultAttachment.left.y,
        direction: { x: 0, y: 1, z: 0 }
      });
      const tensionN = 1.4 * thresholds.fMinRefN;

      const base = defaultRopeParams(geometry, tensionN);
      // Right rope geometry is the exact y-mirror of the left rope geometry.
      const mirrored: RopeParams = {
        tensionN,
        left: base.left,
        right: mirrorRopeGeometry(base.left)
      };

      const leftRun = runPull(mirrored, "left", 2);
      const rightRun = runPull(mirrored, "right", 2);

      expect(leftRun.length).toBe(rightRun.length);

      // Motion must actually happen, or symmetry is vacuous.
      const finalLeft = leftRun[leftRun.length - 1]!;
      expect(Math.abs(finalLeft.rollDeg - leftRun[0]!.rollDeg)).toBeGreaterThan(1);

      // Compared as displacements from the post-settle baseline, not as absolute
      // positions. The unloaded settle is identical in both runs (no rope acts
      // during it), so it deposits the same ~6 um of solver drift in the same
      // direction in each — that shared offset is not mirror-symmetric and is
      // not what this test is about. It is bounded separately below.
      const lBase = leftRun[0]!;
      const rBase = rightRun[0]!;
      expect(Math.abs(lBase.com.y)).toBeLessThan(5e-5);
      expect(Math.abs(rBase.com.y)).toBeLessThan(5e-5);

      for (let i = 0; i < leftRun.length; i++) {
        const l = leftRun[i]!;
        const r = rightRun[i]!;
        const tag = `sample ${i} (t=${l.simTimeS.toFixed(2)}s)`;

        // Lateral displacement and roll mirror (flip sign); the fore-aft and
        // vertical components are unchanged by a y-mirror.
        // Lateral displacement is the primary driven motion; every positional
        // component is judged against its magnitude, and roll against its own.
        const dyL = l.com.y - lBase.com.y;
        const rollL = l.rollDeg - lBase.rollDeg;
        const posScale = Math.max(Math.abs(dyL), SIGNAL_FLOOR_M);
        const rollScale = Math.max(Math.abs(rollL), SIGNAL_FLOOR_DEG);

        expectMirroredTrajectory(r.com.y - rBase.com.y, dyL, posScale, true, `${tag} dy`);
        expectMirroredTrajectory(r.rollDeg - rBase.rollDeg, rollL, rollScale, true, `${tag} droll`);
        expectMirroredTrajectory(r.com.x - rBase.com.x, l.com.x - lBase.com.x, posScale, false, `${tag} dx`);
        expectMirroredTrajectory(r.com.z - rBase.com.z, l.com.z - lBase.com.z, posScale, false, `${tag} dz`);

        // Rope force and torque histories mirror too. These are large-magnitude
        // quantities derived from an f32 pose, so they are compared relatively.
        const lf = l.ropes.left;
        const rf = r.ropes.right;
        expectRelClose(rf.force.y, -lf.force.y, tensionN, `${tag} force.y`);
        expectRelClose(rf.force.x, lf.force.x, tensionN, `${tag} force.x`);
        expectRelClose(rf.force.z, lf.force.z, tensionN, `${tag} force.z`);
        expectRelClose(
          rf.torqueAboutCom.x,
          -lf.torqueAboutCom.x,
          Math.max(Math.abs(lf.torqueAboutCom.x), 1),
          `${tag} torque.x`
        );
      }
    },
    120_000
  );
});
