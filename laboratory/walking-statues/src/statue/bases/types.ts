import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { RapierModule } from "../../physics/rapierSetup";
import type { BaseFamilyId, StatueParams } from "../types";

/**
 * How a base family meets the ground. This drives which static-stability
 * criterion applies, so it is part of the geometry contract rather than
 * something the analysis code guesses from the family id.
 *
 * - "flat": a planar bottom face. Tips about a straight edge a finite
 *   distance `contactHalfWidthY` off the centerline, so the classical
 *   `F_tip = M g b / z_anchor` threshold applies.
 * - "rocker": a curved bottom touching along a line. There is no finite
 *   tipping lever arm (`contactHalfWidthY` is 0) and no static tipping
 *   threshold — stability is a rolling-equilibrium question instead (see
 *   PHYSICS_MODEL.md).
 */
export type BaseContactKind = "flat" | "rocker";

/**
 * Pure scalar dimensions of a base, with no Three.js or Rapier objects
 * involved, so geometry and threshold math can run headlessly (in Node, in
 * unit tests) without constructing a scene or a physics world.
 */
export interface BaseDims {
  /** Extent along x (forward), meters. */
  lengthX: number;
  /** Widest lateral extent along y, meters. */
  widthY: number;
  /** Local z at which the base ends and the torso begins. */
  topZ: number;
  /** Mass assigned across this base's colliders. */
  massKg: number;
  /**
   * Lateral half-width of the ground contact patch — the restoring lever
   * arm `b` in `F_tip = M g b / z_anchor`. Zero for a rocker, which has
   * line contact and therefore no static tipping threshold.
   */
  contactHalfWidthY: number;
  contactKind: BaseContactKind;
}

/**
 * A base family, split into three independent concerns so that the physics
 * can be built without a renderer.
 *
 * `dims` needs neither Rapier nor Three.js, `colliderDescs` needs only
 * Rapier, and `visual` needs only Three.js. The headless benchmark harness
 * and the unit tests call the first two and never construct a mesh; the app
 * calls all three. All three derive from `dims`, so the collision geometry
 * and the display geometry cannot drift apart.
 */
export interface BaseGeometryModule {
  id: BaseFamilyId;
  label: string;
  /** Scalar dimensions only — safe with no Rapier module and no scene. */
  dims(params: StatueParams): BaseDims;
  /** Collider descriptors in body-local space (base bottom at local z = 0).
   * Multiple entries are allowed (e.g. a future faceted/rail base); every
   * family currently implemented returns exactly one. */
  colliderDescs(params: StatueParams, RAPIER: RapierModule): RAPIER.ColliderDesc[];
  /** Display-only mesh in body-local space. Never used for collision. */
  visual(params: StatueParams): THREE.Object3D;
}
