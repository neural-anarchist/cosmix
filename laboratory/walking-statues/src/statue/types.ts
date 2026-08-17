import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Disposable } from "../physics/types";
import type { StatueColliderInfo, StatueMassReport } from "./body";
import type { StatueGeometry } from "./geometry";

/**
 * Full family enum declared now so UI/state code doesn't reshape when more
 * families land; only "A0" and "A4" have an implementation behind them in
 * Phase 1 (see statue/bases/registry.ts). Selecting anything else throws
 * rather than silently substituting a different shape.
 */
export type BaseFamilyId = "A0" | "A4" | "A5" | "B0" | "B2" | "B6";

export interface StatueParams {
  /** Total statue height H, meters, base to crown. */
  heightM: number;
  /** Total mass M, kg. */
  totalMassKg: number;

  baseFamily: BaseFamilyId;
  /** W_base / H. For A0 this is the base's full extent along y. For A4 it
   * is the rocker's full diameter (2 x lateral curvature radius). */
  baseWidthRatio: number;
  /** L_base / H. Full extent along x for both A0 and A4. */
  baseLengthRatio: number;
  /** H_base / H. Used by A0 directly. Not used by A4 — a cylindrical
   * rocker's height is fixed by its radius (baseWidthRatio), and the
   * control is disabled in the UI for that family rather than silently
   * ignored. */
  baseHeightRatio: number;

  /** Fraction of M carried by the base. */
  baseMassFraction: number;
  /** Fraction of M carried by the head. Remainder (1 - base - head) goes
   * to the torso. */
  headMassFraction: number;

  /** Shoulder width (y) at the top of the torso, as a fraction of H. */
  torsoWidthRatio: number;
  /** Body depth (x) at the top of the torso, as a fraction of H. */
  torsoDepthRatio: number;
  /**
   * Fractional narrowing of the torso from its top (shoulders) toward its
   * bottom, applied to both width and depth: bottom = top x (1 - taper).
   * 0 gives the uniform Phase 1 box. Affects the *collision* cross-section as
   * well as the visual, because it changes the real distribution of material.
   */
  torsoTaper: number;

  /**
   * Intrinsic forward lean of the upper body, degrees about +y, pivoting at the
   * top of the base. This is a *modelling* parameter baked into the geometry —
   * deliberately distinct from dynamic pitch, which is the live simulated tilt
   * read off the body's quaternion. Both are reported separately.
   */
  forwardLeanDeg: number;

  /**
   * When true the derived mass properties are discarded and the center of mass
   * is placed explicitly at the three offsets below. Intended for abstract
   * geometry sweeps where COM is the independent variable; see
   * PHASE2_GEOMETRY_AND_CONTROL.md for why the inertia tensor is retained from
   * the derived configuration rather than also being invented.
   */
  comOverrideEnabled: boolean;
  /** Forward COM offset x_COM/H. Only applied when comOverrideEnabled. */
  comOffsetXRatio: number;
  /** Lateral COM offset y_COM/H. Only applied when comOverrideEnabled. */
  comOffsetYRatio: number;
  /** COM height z_COM/H. Only applied when comOverrideEnabled. */
  comHeightRatio: number;

  /**
   * Mesh tessellation only. Provably has no effect on mass, COM, inertia or any
   * collider — asserted by a unit test, because "the pretty version behaves
   * differently" is exactly the kind of drift that makes a simulation
   * untrustworthy.
   */
  visualDetail: VisualDetail;

  linearDampingSI: number;
  angularDampingSI: number;
}

export type VisualDetail = "low" | "medium" | "high";

export interface StatueBuild extends Disposable {
  visual: THREE.Group;
  colliderVisual: THREE.Group;
  comMarker: THREE.Object3D;
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  /** Per-collider component tag and collision-approximation note, for the
   * overlay legend and the diagnostics panel. */
  colliderInfo: StatueColliderInfo[];
  /** Mass, COM and inertia as Rapier reports them, plus whether the COM was
   * explicitly overridden rather than derived. */
  mass: StatueMassReport;
  /** Scalar geometry this build was made from — base dims and contact
   * half-width, torso/head placement, analytic COM, and the default rope
   * attachment points. The rope geometry the simulation actually uses is
   * user-configurable and lives in `RopeParams`, not here. */
  geometry: StatueGeometry;
}
