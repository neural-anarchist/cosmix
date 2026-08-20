import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { RapierModule } from "../../physics/rapierSetup";
import type { Vec3 } from "../../core/vec3";
import type { BaseFamilyId, StatueParams } from "../types";
import type { Polytope } from "./polytope";
import type { SharedBaseParameterId } from "./shared";

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
   *
   * For a base that is asymmetric left-to-right the two sides differ; this
   * carries the *smaller* of the two, because that is the side that gives way
   * first and therefore the one the static threshold is governed by.
   */
  contactHalfWidthY: number;
  /** Contact lever arm toward +y. Equal to `contactHalfWidthY` unless the
   * footprint is laterally asymmetric. */
  contactHalfWidthYLeft: number;
  /** Contact lever arm toward -y. */
  contactHalfWidthYRight: number;
  contactKind: BaseContactKind;
  /**
   * Volume of the geometry that is actually simulated, cubic meters. Used to
   * derive the collider density that lands the base's mass exactly on
   * `baseMassFraction x M`, and reported raw in diagnostics.
   */
  volumeM3: number;
  /** Ground-plane footprint area for a flat-bottomed family, or null for a
   * rocker, which touches along a line and has no meaningful contact area. */
  footprintAreaM2: number | null;
  /**
   * Fore-aft tilt this base imparts to whatever is mounted on it, radians
   * about +y. Non-zero only for a family whose top face is cut at an angle
   * (B6), which leans the upper body *without* disturbing the ground contact
   * geometry. Added to the statue's own `forwardLeanDeg`.
   */
  mountLeanRad: number;
  /** Fore-aft offset of the base relative to the upper body, meters. */
  offsetX: number;
  /**
   * The base's own centre of mass, body-local, assuming uniform density.
   *
   * Not assumed to be `(0, 0, topZ/2)`: that holds for a prism and for a lying
   * cylinder, but a half-ellipsoid's centroid sits at five-eighths of its
   * height and a wedge-topped base's sits off the centreline. Each family
   * reports its own so the statue's analytic COM stays a real cross-check on
   * Rapier's rather than a formula that happens to agree for two shapes.
   */
  comLocal: Vec3;
}

/**
 * A base family, split into independent concerns so that the physics can be
 * built without a renderer.
 *
 * `dims` needs neither Rapier nor Three.js, `colliderDescs` needs only
 * Rapier, and `visual` needs only Three.js. The headless benchmark harness
 * and the unit tests call the first two and never construct a mesh; the app
 * calls all three. All derive from the same shape definition, so the collision
 * geometry and the display geometry cannot drift apart.
 */
export interface BaseGeometryModule {
  id: BaseFamilyId;
  label: string;
  /** One line on what this family is for, shown in the UI next to the picker. */
  summary: string;
  /**
   * Which of the shared normalized parameters this family actually reads.
   * The UI greys out the rest and the diagnostics panel lists them, because a
   * control that appears to do something but does not is worse than no control.
   */
  usesParameters: readonly SharedBaseParameterId[];
  /**
   * How this family's collision geometry approximates its visual shape, in one
   * sentence, shown next to the collider overlay. Every family must state this:
   * a curved base rendered smoothly but collided as primitives is a modelling
   * choice the reader is entitled to see, not an implementation detail. Takes
   * the parameters because some families approximate differently depending on
   * how they are configured.
   */
  colliderApproximation(params: StatueParams): string;
  /** Rejects parameter combinations this family cannot build, with a message
   * naming the control to change. Called before any geometry is constructed. */
  validate(params: StatueParams): void;
  /** Scalar dimensions only — safe with no Rapier module and no scene. */
  dims(params: StatueParams): BaseDims;
  /**
   * The exact triangulated solid that is both simulated and drawn, for the
   * families built that way. Null for A0 and A4, which keep the exact analytic
   * cuboid and cylinder primitives they were validated with in Phase 1 — for
   * those two the ideal shape *is* the primitive, and tessellating it would be
   * a regression rather than an approximation.
   */
  polytope(params: StatueParams): Polytope | null;
  /**
   * The solids actually handed to the physics solver, which for a flat-bottomed
   * family is `polytope` split into wedges rather than the single solid — see
   * `wedgeDecomposition` for the contact-patch collapse that makes the split
   * necessary. Their union is exactly `polytope`. Null for A0 and A4, whose
   * colliders are analytic primitives.
   *
   * The collider overlay draws these rather than the display mesh, so what the
   * overlay shows is what the solver has.
   */
  colliderPolytopes(params: StatueParams): Polytope[] | null;
  /** Collider descriptors in body-local space (base bottom at local z = 0).
   * Multiple entries are allowed; every family currently implemented returns
   * exactly one. */
  colliderDescs(params: StatueParams, RAPIER: RapierModule): RAPIER.ColliderDesc[];
  /** Display-only mesh in body-local space. Never used for collision. */
  visual(params: StatueParams): THREE.Object3D;
}

export type { Polytope };
export type { SharedBaseParameterId };
export type { BaseFamilyId };
