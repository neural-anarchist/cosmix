import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { RopeSolution } from "./ropeModel";

/**
 * Clears the previous step's user loads and applies this step's rope forces.
 * Call once per fixed physics step, immediately before `world.step()`.
 *
 * ## Why the resets are load-bearing
 *
 * Rapier's `addForce` / `addForceAtPoint` / `addTorque` do **not** set a force
 * for one step. They *add into a latch on the rigid body that `world.step()`
 * never clears*; only `resetForces` / `resetTorques` clear it. Calling
 * `addForceAtPoint` once per step without resetting therefore applies `n × F`
 * on step `n`, growing without bound for as long as a rope is held, and the
 * latched load then persists forever after release.
 *
 * That was the Phase 1 defect: a nominal 3000 N pull (33% of this statue's
 * tipping threshold, a force that must hold static) reached ~3.6 MN over a 5 s
 * hold — about 92x the statue's weight — and moved it 1.4 km. It presented as
 * "a below-threshold force still rotates the statue", which looks like a
 * contact or friction problem and is not one. Full measurements and derivation
 * in PHASE1_FORCE_CONTACT_AUDIT.md §3.
 *
 * Both resets are required, not just `resetForces`: Rapier documents that one
 * as resetting "the user forces (but not torques)", and `addForceAtPoint`
 * decomposes into a force at the COM *plus* a torque. Resetting only forces
 * silences the runaway translation and leaves the runaway spin — measured at
 * 31x the intended angular velocity.
 *
 * Deliberately *not* how this was fixed: global damping, a velocity clamp, or
 * pinning the body. With this fix the statue holds static equilibrium at 95% of
 * its tipping threshold with damping set to zero, so the contact solver is
 * doing the work (audit §5, §6).
 */
export function applyRopeForces(rigidBody: RAPIER.RigidBody, solutions: readonly RopeSolution[]): void {
  rigidBody.resetForces(true);
  rigidBody.resetTorques(true);

  for (const solution of solutions) {
    if (!solution.active || solution.tensionN <= 0) continue;
    rigidBody.addForceAtPoint(solution.force, solution.attachmentWorld, true);
  }
}
