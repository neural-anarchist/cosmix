import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { RapierModule } from "../physics/rapierSetup";
import type { RoadParams } from "./types";

/** Thickness of the road slab. The collider is a solid cuboid rather than a
 * half-space so that a future concave/rough road can reuse the same body
 * type, and so the road has a visible edge. */
export const ROAD_SLAB_THICKNESS_M = 0.4;

export interface RoadBody {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

/**
 * Builds the road's physics only: a fixed cuboid whose **top face sits at
 * exactly z = 0**, matching the statue body's origin convention (base bottom
 * at local z = 0), so a statue spawned at (0,0,0) rests coincident with the
 * surface — neither interpenetrating nor floating.
 *
 * Separated from `flatRoad.ts` (which adds the visual) so the headless
 * benchmark harness can build the same ground without a Three.js scene.
 */
export function createRoadBody(
  RAPIER_MODULE: RapierModule,
  world: RAPIER.World,
  params: RoadParams
): RoadBody {
  if (params.type !== "flat") {
    throw new Error(
      `createRoadBody only supports type "flat"; got "${params.type}". ` +
        "Concave and rough road modes are not implemented yet (see PLAN.md)."
    );
  }

  const halfThickness = ROAD_SLAB_THICKNESS_M / 2;
  const rigidBody = world.createRigidBody(
    RAPIER_MODULE.RigidBodyDesc.fixed().setTranslation(0, 0, -halfThickness)
  );
  const collider = world.createCollider(
    RAPIER_MODULE.ColliderDesc.cuboid(params.lengthM / 2, params.widthM / 2, halfThickness)
      .setFriction(params.frictionCoefficient)
      .setRestitution(params.restitution),
    rigidBody
  );

  return { rigidBody, collider };
}
