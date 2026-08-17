import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { RapierModule } from "../physics/rapierSetup";
import { getBaseModule } from "./bases/registry";
import { computeStatueGeometry, type StatueGeometry } from "./geometry";
import type { StatueParams } from "./types";

export interface StatueBody {
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  geometry: StatueGeometry;
}

/**
 * Builds the statue's physics only — one dynamic compound rigid body with a
 * base, torso and head collider — with no Three.js involvement whatsoever.
 *
 * Kept separate from `factory.ts` (which adds the display meshes on top of
 * this) so the static-equilibrium benchmark, the force-ramp test and the
 * regression tests can build the *same* body headlessly in Node. Before this
 * split there was no way to assert on the physics without a WebGL context,
 * which is a large part of why the force-accumulation bug survived a whole
 * phase of manual testing (see PHASE1_FORCE_CONTACT_AUDIT.md).
 *
 * Mass properties are never set directly: each collider gets a density
 * computed from its target sub-mass and its analytic volume, and Rapier
 * derives the aggregate mass, COM and inertia tensor from those.
 */
export function createStatueBody(
  params: StatueParams,
  RAPIER_MODULE: RapierModule,
  world: RAPIER.World,
  contactFrictionCoefficient: number,
  contactRestitution: number
): StatueBody {
  const geometry = computeStatueGeometry(params);
  const baseModule = getBaseModule(params.baseFamily);

  // Body origin at the base's bottom-center, so translation (0,0,0) spawns
  // the statue resting exactly on a road whose top surface is at z = 0.
  const rigidBody = world.createRigidBody(
    RAPIER_MODULE.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(params.linearDampingSI)
      .setAngularDamping(params.angularDampingSI)
  );

  const { torso, head } = geometry;
  const torsoDensity = torso.massKg / (torso.widthY * torso.depthX * torso.heightZ);
  const headDensity = head.massKg / ((4 / 3) * Math.PI * head.radius ** 3);

  const descs: RAPIER.ColliderDesc[] = [
    ...baseModule.colliderDescs(params, RAPIER_MODULE),
    // Half-extents are (x/forward, y/lateral, z/vertical) throughout.
    RAPIER_MODULE.ColliderDesc.cuboid(torso.depthX / 2, torso.widthY / 2, torso.heightZ / 2)
      .setTranslation(0, 0, torso.centerZ)
      .setDensity(torsoDensity),
    RAPIER_MODULE.ColliderDesc.ball(head.radius)
      .setTranslation(0, 0, head.centerZ)
      .setDensity(headDensity)
  ];

  const colliders = descs.map((desc) =>
    world.createCollider(
      desc.setFriction(contactFrictionCoefficient).setRestitution(contactRestitution),
      rigidBody
    )
  );

  return { rigidBody, colliders, geometry };
}
