import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Disposable } from "../physics/types";
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

  /** Simple box torso stand-in, width (y) and depth (x) as a fraction of H.
   * Replaced by the tapered procedural torso in Phase 2. */
  torsoWidthRatio: number;
  torsoDepthRatio: number;

  linearDampingSI: number;
  angularDampingSI: number;
}

export interface StatueBuild extends Disposable {
  visual: THREE.Group;
  colliderVisual: THREE.Group;
  comMarker: THREE.Object3D;
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  /** Scalar geometry this build was made from — base dims and contact
   * half-width, torso/head placement, analytic COM, and the default rope
   * attachment points. The rope geometry the simulation actually uses is
   * user-configurable and lives in `RopeParams`, not here. */
  geometry: StatueGeometry;
}
