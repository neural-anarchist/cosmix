import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Disposable } from "../physics/types";

/** Only the flat mode exists in Phase 1; concave and rough modes are Phase 3
 * and Phase 5 respectively (see PLAN.md). The union is declared in full now
 * so the rest of the codebase (UI select, RoadParams) doesn't need to change
 * shape when they land — selecting an unimplemented mode is rejected with a
 * clear error rather than silently falling back to flat. */
export type RoadType = "flat" | "concave" | "rough";

export interface RoadParams {
  type: RoadType;
  /** Total drivable length along x, meters. */
  lengthM: number;
  /** Total road width along y, meters. */
  widthM: number;
  frictionCoefficient: number;
  restitution: number;
  /** Not yet applied to the collider shape in Phase 1 (flat road only);
   * reserved for the Phase 3 concave/sloped road. */
  longitudinalSlopeRad: number;
  crossSlopeRad: number;
}

export interface RoadBuild extends Disposable {
  visual: THREE.Group;
  collider: RAPIER.Collider;
}
