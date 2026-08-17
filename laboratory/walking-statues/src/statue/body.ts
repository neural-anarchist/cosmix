import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { RapierModule } from "../physics/rapierSetup";
import type { Vec3 } from "../core/vec3";
import { getBaseModule } from "./bases/registry";
import { computeStatueGeometry, type StatueGeometry } from "./geometry";
import type { StatueParams } from "./types";

/** Which compound component a collider belongs to, so the overlay can label and
 * colour each one and diagnostics can report them separately. */
export type StatueComponent = "base" | "torso" | "head";

export interface StatueColliderInfo {
  collider: RAPIER.Collider;
  component: StatueComponent;
  /** Human-readable description of the collision approximation used. */
  approximation: string;
}

export interface StatueMassReport {
  massKg: number;
  comLocal: Vec3;
  principalInertia: Vec3;
  /** True when the derived mass properties were replaced by an explicit COM. */
  comOverridden: boolean;
}

export interface StatueBody {
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  colliderInfo: StatueColliderInfo[];
  geometry: StatueGeometry;
  mass: StatueMassReport;
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
 * Mass properties are never set directly in the normal path: each collider gets
 * a density computed from its target sub-mass and its analytic volume, and
 * Rapier derives the aggregate mass, COM and inertia tensor from those. The one
 * exception is the explicit COM override, documented below.
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

  const { torso, head, torsoPlacement, headPlacement } = geometry;
  const torsoDensity = torso.massKg / (torso.widthY * torso.depthX * torso.heightZ);
  const headDensity = head.massKg / ((4 / 3) * Math.PI * head.radius ** 3);

  const entries: { desc: RAPIER.ColliderDesc; component: StatueComponent; approximation: string }[] = [
    ...baseModule.colliderDescs(params, RAPIER_MODULE).map((desc) => ({
      desc,
      component: "base" as const,
      approximation: baseModule.colliderApproximation
    })),
    {
      // Half-extents are (x/forward, y/lateral, z/vertical) throughout.
      desc: RAPIER_MODULE.ColliderDesc.cuboid(torso.depthX / 2, torso.widthY / 2, torso.heightZ / 2)
        .setTranslation(torsoPlacement.position.x, torsoPlacement.position.y, torsoPlacement.position.z)
        .setRotation(torsoPlacement.rotation)
        .setDensity(torsoDensity),
      component: "torso",
      approximation:
        params.torsoTaper > 0
          ? "Tapered torso collided as a single cuboid at its mean cross-section."
          : "Uniform box torso collided exactly as a cuboid."
    },
    {
      desc: RAPIER_MODULE.ColliderDesc.ball(head.radius)
        .setTranslation(headPlacement.position.x, headPlacement.position.y, headPlacement.position.z)
        .setDensity(headDensity),
      component: "head",
      approximation:
        "Blocky Moai head collided as an inscribed sphere of radius H_head/2 — a " +
        "conservative, deliberately simple stand-in retained unchanged from the " +
        "validated Phase 1 configuration."
    }
  ];

  const colliderInfo: StatueColliderInfo[] = entries.map((entry) => ({
    collider: world.createCollider(
      entry.desc.setFriction(contactFrictionCoefficient).setRestitution(contactRestitution),
      rigidBody
    ),
    component: entry.component,
    approximation: entry.approximation
  }));
  const colliders = colliderInfo.map((info) => info.collider);

  rigidBody.recomputeMassPropertiesFromColliders();

  if (geometry.comOverrideLocal) {
    applyComOverride(rigidBody, colliders, params.totalMassKg, geometry.comOverrideLocal);
  }

  const comLocal = rigidBody.localCom();
  const principal = rigidBody.principalInertia();

  return {
    rigidBody,
    colliders,
    colliderInfo,
    geometry,
    mass: {
      massKg: rigidBody.mass(),
      comLocal: { x: comLocal.x, y: comLocal.y, z: comLocal.z },
      principalInertia: { x: principal.x, y: principal.y, z: principal.z },
      comOverridden: geometry.comOverrideLocal !== null
    }
  };
}

/**
 * Forces the center of mass to an explicit point, for sweeps where COM is the
 * independent variable rather than a consequence of geometry.
 *
 * Rapier has no "move the COM" call, so this works the only way it can: zero
 * every collider's density, which removes their contribution to the aggregate
 * entirely, then supply the whole mass/COM/inertia as additional mass
 * properties. Collider *shapes* are untouched, so contact behaviour is
 * unchanged — only the inertial properties move.
 *
 * The rotational inertia is deliberately carried over from the derived
 * configuration rather than also being invented: the parameter set exposes a
 * COM, not an inertia tensor, and fabricating a tensor to match an arbitrary
 * COM would silently change the rocking dynamics that the sweep is trying to
 * attribute to COM placement. This means an overridden COM is *not* a fully
 * self-consistent rigid body — it is an abstract probe, and it is labelled as
 * one in the UI and diagnostics.
 */
function applyComOverride(
  rigidBody: RAPIER.RigidBody,
  colliders: RAPIER.Collider[],
  totalMassKg: number,
  comLocal: Vec3
): void {
  const principal = rigidBody.principalInertia();
  const frame = rigidBody.principalInertiaLocalFrame();
  const inertia = { x: principal.x, y: principal.y, z: principal.z };
  const inertiaFrame = { x: frame.x, y: frame.y, z: frame.z, w: frame.w };

  for (const collider of colliders) collider.setDensity(0);

  rigidBody.setAdditionalMassProperties(totalMassKg, comLocal, inertia, inertiaFrame, true);
  rigidBody.recomputeMassPropertiesFromColliders();
}
