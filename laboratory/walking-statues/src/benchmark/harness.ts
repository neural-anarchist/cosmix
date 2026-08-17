import type * as RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_TIMESTEP_S, GRAVITY_M_S2 } from "../core/constants";
import { quaternionToRollPitchYaw, radToDeg } from "../core/orientation";
import type { Quat, Vec3 } from "../core/vec3";
import { applyRopeForces } from "../control/ropeForces";
import { solveRopes, type RopeHoldState, type RopeParams, type RopeSolution } from "../control/ropeModel";
import { createRoadBody } from "../road/body";
import type { RoadParams } from "../road/types";
import { createStatueBody } from "../statue/body";
import type { StatueGeometry } from "../statue/geometry";
import type { StatueParams } from "../statue/types";
import type { RapierModule } from "../physics/rapierSetup";

export interface HarnessConfig {
  statueParams: StatueParams;
  roadParams: RoadParams;
  ropeParams: RopeParams;
  held: RopeHoldState;
}

export interface HarnessSample {
  simTimeS: number;
  com: Vec3;
  linvel: Vec3;
  angvel: Vec3;
  speedMps: number;
  angularSpeedRadPerS: number;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
  contactCount: number;
  ropes: { left: RopeSolution; right: RopeSolution };
}

/**
 * A complete statue-on-road simulation with no renderer, driving the *same*
 * geometry, force model and stepping order the app's engine uses:
 * `solveRopes` -> `applyRopeForces` (which resets Rapier's force latch) ->
 * `world.step()`, at the same fixed 1/240 s timestep.
 *
 * This is what makes the benchmark and the regression tests meaningful — they
 * exercise the production force path rather than a reimplementation of it. If
 * the force-latch reset were ever removed from `applyRopeForces`, the static
 * equilibrium test would fail immediately.
 */
export class BenchmarkHarness {
  readonly world: RAPIER.World;
  readonly rigidBody: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[];
  readonly geometry: StatueGeometry;
  readonly roadCollider: RAPIER.Collider;

  ropeParams: RopeParams;
  held: RopeHoldState;

  private simTimeS = 0;

  constructor(RAPIER_MODULE: RapierModule, config: HarnessConfig) {
    this.world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
    this.world.timestep = FIXED_TIMESTEP_S;

    const road = createRoadBody(RAPIER_MODULE, this.world, config.roadParams);
    this.roadCollider = road.collider;

    const statue = createStatueBody(
      config.statueParams,
      RAPIER_MODULE,
      this.world,
      config.roadParams.frictionCoefficient,
      config.roadParams.restitution
    );
    this.rigidBody = statue.rigidBody;
    this.colliders = statue.colliders;
    this.geometry = statue.geometry;

    this.ropeParams = config.ropeParams;
    this.held = config.held;
  }

  get simTime(): number {
    return this.simTimeS;
  }

  private translation(): Vec3 {
    const t = this.rigidBody.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  private rotation(): Quat {
    const r = this.rigidBody.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }

  private comWorld(): Vec3 {
    const c = this.rigidBody.worldCom();
    return { x: c.x, y: c.y, z: c.z };
  }

  solveRopesNow(): { left: RopeSolution; right: RopeSolution } {
    return solveRopes(this.ropeParams, this.held, this.translation(), this.rotation(), this.comWorld());
  }

  /** One fixed physics step, in the app's exact order. */
  step(): void {
    const ropes = this.solveRopesNow();
    applyRopeForces(this.rigidBody, [ropes.left, ropes.right]);
    this.world.step();
    this.simTimeS += FIXED_TIMESTEP_S;
  }

  /** Runs for `seconds` of simulated time. */
  run(seconds: number): void {
    const steps = Math.round(seconds / FIXED_TIMESTEP_S);
    for (let i = 0; i < steps; i++) this.step();
  }

  /**
   * Runs with both ropes released so the body reaches a genuine resting state
   * before a measurement window opens. Without this, the first millimetres of
   * gravity settling would be attributed to the rope.
   */
  settle(seconds = 0.5): void {
    const restoreLeft = this.held.leftHeld;
    const restoreRight = this.held.rightHeld;
    this.held = { leftHeld: false, rightHeld: false };
    this.run(seconds);
    this.held = { leftHeld: restoreLeft, rightHeld: restoreRight };
  }

  /** Number of road/statue contact pairs currently touching. */
  contactCount(): number {
    let count = 0;
    for (const collider of this.colliders) {
      this.world.contactPairsWith(collider, () => {
        count++;
      });
    }
    return count;
  }

  /** Total normal impulse across all statue contacts this step, N·s. Divided
   * by the timestep this approximates the normal contact force, though it also
   * carries the solver's penetration-correction bias, so it is reported as a
   * proxy rather than a measurement. */
  normalImpulseNs(): number {
    let total = 0;
    for (const collider of this.colliders) {
      this.world.contactPair(collider, this.roadCollider, (manifold) => {
        for (let i = 0; i < manifold.numContacts(); i++) total += manifold.contactImpulse(i);
      });
    }
    return total;
  }

  sample(): HarnessSample {
    const com = this.comWorld();
    const lv = this.rigidBody.linvel();
    const av = this.rigidBody.angvel();
    const rot = this.rigidBody.rotation();
    const { roll, pitch, yaw } = quaternionToRollPitchYaw(rot.x, rot.y, rot.z, rot.w);

    return {
      simTimeS: this.simTimeS,
      com,
      linvel: { x: lv.x, y: lv.y, z: lv.z },
      angvel: { x: av.x, y: av.y, z: av.z },
      speedMps: Math.hypot(lv.x, lv.y, lv.z),
      angularSpeedRadPerS: Math.hypot(av.x, av.y, av.z),
      rollDeg: radToDeg(roll),
      pitchDeg: radToDeg(pitch),
      yawDeg: radToDeg(yaw),
      contactCount: this.contactCount(),
      ropes: this.solveRopesNow()
    };
  }

  dispose(): void {
    this.world.free();
  }
}
