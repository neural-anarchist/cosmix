import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { RapierModule } from "../physics/rapierSetup";
import type { Vec3 } from "../core/vec3";
import { getBaseModule } from "./bases/registry";
import { computeStatueGeometry, type StatueGeometry } from "./geometry";
import type { BallastSpec, StatueParams } from "./types";

/** Which compound component a collider belongs to, so the overlay can label and
 * colour each one and diagnostics can report them separately. */
export type StatueComponent = "base" | "torso" | "head";

export interface StatueColliderInfo {
  collider: RAPIER.Collider;
  component: StatueComponent;
  /** Human-readable description of the collision approximation used. */
  approximation: string;
}

/**
 * Raw, per-collider mass bookkeeping — the numbers that go *into* Rapier's mass
 * computation rather than the aggregate that comes out.
 *
 * Reported because the aggregate alone cannot tell you whether a base family's
 * volume was computed correctly: a wrong volume and a compensating wrong density
 * produce exactly the right total mass and a quietly wrong inertia tensor. With
 * the target mass, the volume and the density each shown, and Rapier's own
 * per-collider mass alongside, that failure has nowhere to hide.
 */
export interface ComponentMassReport {
  component: StatueComponent;
  /** How many colliders make up this component. More than one for a
   * flat-bottomed base, which is split into wedges for contact stability. */
  colliderCount: number;
  /** Mass this component was *asked* to have, from the mass-fraction controls. */
  targetMassKg: number;
  /** Volume of the collider primitive, as this code computed it. */
  volumeM3: number;
  /** Volume of the collider Rapier actually built. For a convex-hull base this
   * can sit a fraction of a percent below `volumeM3`, because Rapier's hull
   * builder merges near-coplanar vertices; the difference is the faceting
   * deficit and is shown rather than absorbed. */
  colliderVolumeM3: number;
  /** Density handed to Rapier: target mass / volume. */
  densityKgPerM3: number;
  /** Mass Rapier reports for the collider it actually built. Divergence from
   * `targetMassKg` means the volume assumed here is not the volume of the
   * shape Rapier constructed. */
  rapierMassKg: number;
}

export interface StatueMassReport {
  massKg: number;
  /** The matched-comparison ballast actually applied, or null. */
  ballast: BallastSpec | null;
  comLocal: Vec3;
  principalInertia: Vec3;
  /** True when the derived mass properties were replaced by an explicit COM. */
  comOverridden: boolean;
  /** Per-collider inputs and Rapier's per-collider result. */
  components: ComponentMassReport[];
  /** COM computed independently in `geometry.ts` from the same primitives.
   * Cross-checked against `comLocal` in the unit tests and displayed beside it,
   * so a density, volume or placement error surfaces as a visible disagreement
   * rather than as a plausible-looking number. */
  comLocalAnalytic: Vec3;
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
  const torsoVolume = torso.widthY * torso.depthX * torso.heightZ;
  const headVolume = (4 / 3) * Math.PI * head.radius ** 3;
  const torsoDensity = torso.massKg / torsoVolume;
  const headDensity = head.massKg / headVolume;

  const entries: {
    desc: RAPIER.ColliderDesc;
    component: StatueComponent;
    approximation: string;
    targetMassKg: number;
    volumeM3: number;
  }[] = [
    // A flat-bottomed family returns several wedge colliders rather than one
    // solid (see bases/footprints.ts `wedgeDecomposition`). They share a single
    // uniform density, so the base's target mass and volume belong to the set
    // rather than to any one piece, and are aggregated below.
    ...baseModule.colliderDescs(params, RAPIER_MODULE).map((desc) => ({
      desc,
      component: "base" as const,
      approximation: baseModule.colliderApproximation(params),
      targetMassKg: geometry.base.massKg,
      volumeM3: geometry.base.volumeM3
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
          : "Uniform box torso collided exactly as a cuboid.",
      targetMassKg: torso.massKg,
      volumeM3: torsoVolume
    },
    {
      desc: RAPIER_MODULE.ColliderDesc.ball(head.radius)
        .setTranslation(headPlacement.position.x, headPlacement.position.y, headPlacement.position.z)
        .setDensity(headDensity),
      component: "head",
      approximation:
        "Blocky Moai head collided as an inscribed sphere of radius H_head/2 — a " +
        "conservative, deliberately simple stand-in retained unchanged from the " +
        "validated Phase 1 configuration.",
      targetMassKg: head.massKg,
      volumeM3: headVolume
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

  // Densities were computed from this code's own volumes. For a convex-hull
  // base, the solid Rapier builds can enclose slightly less than the polytope
  // handed to it, which would leave the base a fraction of a percent light and
  // silently shift the whole statue's COM. Rescaling against the colliders' own
  // total volume puts the base's mass exactly on its target — and it is the
  // *total* that matters, since the wedges share one uniform density and only
  // their sum is the base.
  //
  // A0 and A4 are deliberately excluded: their colliders are analytic
  // primitives whose volume is exact by construction, so there is nothing to
  // correct, and leaving that path untouched keeps the validated Phase 1
  // configuration bit-identical.
  if (baseModule.polytope(params) !== null) {
    const baseColliders = colliders.filter((_, i) => entries[i]!.component === "base");
    const builtVolume = baseColliders.reduce((sum, collider) => sum + collider.volume(), 0);
    if (builtVolume > 0) {
      const density = geometry.base.massKg / builtVolume;
      for (const collider of baseColliders) collider.setDensity(density);
    }
  }

  rigidBody.recomputeMassPropertiesFromColliders();

  // Captured before any COM override zeroes the densities, so the report still
  // shows what the geometry actually weighed.
  const componentMasses = colliders.map((collider) => collider.mass());
  const colliderVolumes = colliders.map((collider) => collider.volume());

  if (geometry.comOverrideLocal) {
    applyComOverride(rigidBody, colliders, params.totalMassKg, geometry.comOverrideLocal);
  } else if (params.ballast) {
    applyBallast(rigidBody, params.ballast);
  }

  const comLocal = rigidBody.localCom();
  const principal = rigidBody.principalInertia();

  // Aggregated per component rather than per collider: a base split into six
  // wedges is still one component with one target mass, and six near-identical
  // rows would obscure exactly the comparison this report exists to make.
  const components: ComponentMassReport[] = [];
  for (const component of ["base", "torso", "head"] as const) {
    const indices = entries.flatMap((entry, i) => (entry.component === component ? [i] : []));
    if (indices.length === 0) continue;
    const first = entries[indices[0]!]!;
    const colliderVolumeM3 = indices.reduce((sum, i) => sum + colliderVolumes[i]!, 0);
    components.push({
      component,
      colliderCount: indices.length,
      targetMassKg: first.targetMassKg,
      volumeM3: first.volumeM3,
      colliderVolumeM3,
      densityKgPerM3: colliders[indices[0]!]!.density(),
      rapierMassKg: indices.reduce((sum, i) => sum + componentMasses[i]!, 0)
    });
  }

  return {
    rigidBody,
    colliders,
    colliderInfo,
    geometry,
    mass: {
      massKg: rigidBody.mass(),
      comLocal: { x: comLocal.x, y: comLocal.y, z: comLocal.z },
      principalInertia: { x: principal.x, y: principal.y, z: principal.z },
      comOverridden: geometry.comOverrideLocal !== null,
      ballast: geometry.comOverrideLocal ? null : (params.ballast ?? null),
      components,
      comLocalAnalytic: geometry.comLocalAnalytic
    }
  };
}

/**
 * Adds an explicitly labelled internal ballast mass.
 *
 * Applied through Rapier's *additional* mass properties, which are summed with
 * the properties derived from the colliders. No collider is added, moved,
 * resized or re-densified, so the contact behaviour of a ballasted statue is
 * provably identical to the same statue without ballast — the only thing that
 * changes is where its mass sits. That is precisely why matched-comparison mode
 * prefers this over the abstract COM override: the result is a real rigid body
 * with a real mass distribution, not a probe.
 *
 * The ballast carries no rotational inertia of its own — it is treated as a
 * point mass — so its whole contribution to the inertia tensor comes from the
 * parallel-axis term of its offset, which Rapier applies. A point mass is the
 * conservative choice: giving it a fabricated spread would silently change the
 * rocking dynamics a comparison is trying to hold fixed.
 */
function applyBallast(rigidBody: RAPIER.RigidBody, ballast: BallastSpec): void {
  rigidBody.setAdditionalMassProperties(
    ballast.massKg,
    ballast.localPosition,
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    true
  );
  rigidBody.recomputeMassPropertiesFromColliders();
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
