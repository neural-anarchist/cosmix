import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_STATIC_EQUILIBRIUM,
  runStaticEquilibriumBenchmark
} from "../../benchmark/staticEquilibrium";
import { GRAVITY_M_S2 } from "../../core/constants";
import { getRapier, type RapierModule } from "../../physics/rapierSetup";
import { createRoadBody } from "../../road/body";
import type { RoadParams } from "../../road/types";
import { createStatueBody } from "../body";
import { PHASE1_BASELINE_STATUE_PARAMS } from "../defaults";
import { computeStatueGeometry } from "../geometry";
import type { BaseFamilyId, StatueParams } from "../types";
import { footprintArea, footprintCentroid, wedgeDecomposition } from "./footprints";
import { polytopeBounds, polytopeVolume } from "./polytope";
import { CONTACT_WEDGE_COUNT } from "./polytopeFamily";
import { ALL_BASE_FAMILY_IDS, getBaseModule } from "./registry";

const ROAD: RoadParams = {
  type: "flat",
  lengthM: 40,
  widthM: 6,
  frictionCoefficient: 0.65,
  restitution: 0.05,
  longitudinalSlopeRad: 0,
  crossSlopeRad: 0
};

let RAPIER_MODULE: RapierModule;
beforeAll(async () => {
  RAPIER_MODULE = await getRapier();
}, 30_000);

const params = (id: BaseFamilyId, overrides: Partial<StatueParams> = {}): StatueParams => ({
  ...PHASE1_BASELINE_STATUE_PARAMS,
  baseFamily: id,
  ...overrides
});

/** Drops the statue on the road with no ropes at all and lets it settle. */
function freeSettle(statueParams: StatueParams, seconds = 3): {
  riseMm: number;
  driftMm: number;
  speedMps: number;
  angularSpeedRadPerS: number;
  contactPatchSpanM: number;
} {
  const world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
  world.timestep = 1 / 240;
  const road = createRoadBody(RAPIER_MODULE, world, ROAD);
  const statue = createStatueBody(
    statueParams,
    RAPIER_MODULE,
    world,
    ROAD.frictionCoefficient,
    ROAD.restitution
  );
  const start = statue.rigidBody.translation();
  const startX = start.x;
  const startY = start.y;
  const startZ = start.z;
  for (let i = 0; i < Math.round(240 * seconds); i++) world.step();

  const end = statue.rigidBody.translation();
  const v = statue.rigidBody.linvel();
  const w = statue.rigidBody.angvel();

  // The widest span of the base's contact points, which is the quantity that
  // collapses when the manifold degenerates.
  const points: { x: number; y: number }[] = [];
  for (const collider of statue.colliders) {
    world.contactPair(collider, road.collider, (manifold) => {
      for (let k = 0; k < manifold.numSolverContacts(); k++) {
        const p = manifold.solverContactPoint(k);
        if (p) points.push({ x: p.x, y: p.y });
      }
    });
  }
  const span = points.length
    ? Math.max(
        Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
        Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))
      )
    : 0;

  const result = {
    riseMm: (end.z - startZ) * 1000,
    driftMm: Math.hypot(end.x - startX, end.y - startY) * 1000,
    speedMps: Math.hypot(v.x, v.y, v.z),
    angularSpeedRadPerS: Math.hypot(w.x, w.y, w.z),
    contactPatchSpanM: span
  };
  world.free();
  return result;
}

/**
 * The regression for a real, measured defect.
 *
 * Rapier keeps at most four solver contacts per collider pair, and for a
 * convex-polyhedron base resting face-down its point selection could collapse
 * the contact patch — measured at 39 mm on a 0.43 m base after three seconds —
 * leaving the statue balanced on a stamp, injecting energy, and climbing ~14 mm
 * with nothing pulling on it. A0 never showed it because box-versus-box has its
 * own specialised contact path.
 *
 * The fix is to hand each flat-bottomed base to the solver as a fan of wedge
 * colliders whose union is the identical solid. This test is what stops that
 * regressing, and it is deliberately written on the *observable* — a statue
 * standing on a level road with no forces applied must not move — rather than
 * on any internal detail of the decomposition.
 */
describe("a statue with no rope tension stays at rest", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s does not creep, climb or rotate under gravity alone", (id) => {
    const settled = freeSettle(params(id));

    expect(settled.speedMps).toBeLessThan(1e-3);
    expect(settled.angularSpeedRadPerS).toBeLessThan(1e-3);
    // Sub-millimetre in every direction. The failure being guarded against
    // produced 10-35 mm of *upward* travel, so the rise bound is two-sided.
    expect(Math.abs(settled.riseMm)).toBeLessThan(1);
    expect(settled.driftMm).toBeLessThan(1);
  }, 60_000);

  it.each(ALL_BASE_FAMILY_IDS)("%s keeps a contact patch wide enough to stand on", (id) => {
    const settled = freeSettle(params(id));
    const dims = getBaseModule(id).dims(params(id));
    if (dims.contactKind === "rocker") {
      // A rocker genuinely touches along a line; a narrow patch is correct.
      expect(settled.contactPatchSpanM).toBeGreaterThan(0);
      return;
    }
    // At least a third of the base's smaller plan dimension. The collapsed
    // manifold measured 39 mm against a 770 mm length — about 5%.
    expect(settled.contactPatchSpanM).toBeGreaterThan(Math.min(dims.lengthX, dims.widthY) / 3);
  }, 60_000);

  it.each(ALL_BASE_FAMILY_IDS)("%s is still at rest after a longer hold", (id) => {
    // The defect grew over time — a short run looked fine. Ten seconds is long
    // enough that a 0.3 m/s drift would have moved the statue metres.
    const settled = freeSettle(params(id), 10);
    expect(settled.speedMps).toBeLessThan(1e-3);
    expect(Math.abs(settled.riseMm)).toBeLessThan(1);
  }, 120_000);
});

describe("wedge decomposition preserves the solid exactly", () => {
  const flatFamilies = ALL_BASE_FAMILY_IDS.filter(
    (id) => getBaseModule(id).dims(params(id)).contactKind === "flat" && getBaseModule(id).polytope(params(id))
  );

  it("splits every flat-bottomed family and leaves the rockers whole", () => {
    for (const id of ALL_BASE_FAMILY_IDS) {
      const pieces = getBaseModule(id).colliderPolytopes(params(id));
      const dims = getBaseModule(id).dims(params(id));
      if (!pieces) {
        expect(["A0", "A4"]).toContain(id);
        continue;
      }
      expect(pieces.length).toBe(dims.contactKind === "flat" ? CONTACT_WEDGE_COUNT : 1);
    }
  });

  it.each(flatFamilies)("%s's wedges sum to the whole solid's volume", (id) => {
    const whole = polytopeVolume(getBaseModule(id).polytope(params(id))!);
    const pieces = getBaseModule(id).colliderPolytopes(params(id))!;
    const sum = pieces.reduce((acc, piece) => acc + polytopeVolume(piece), 0);
    expect(sum).toBeCloseTo(whole, 9);
  });

  it.each(flatFamilies)("%s's wedges span exactly the whole solid's bounds", (id) => {
    const whole = polytopeBounds(getBaseModule(id).polytope(params(id))!);
    const pieces = getBaseModule(id).colliderPolytopes(params(id))!;
    const bounds = pieces.map(polytopeBounds);
    expect(Math.min(...bounds.map((b) => b.minX))).toBeCloseTo(whole.minX, 9);
    expect(Math.max(...bounds.map((b) => b.maxX))).toBeCloseTo(whole.maxX, 9);
    expect(Math.min(...bounds.map((b) => b.minY))).toBeCloseTo(whole.minY, 9);
    expect(Math.max(...bounds.map((b) => b.maxY))).toBeCloseTo(whole.maxY, 9);
    expect(Math.max(...bounds.map((b) => b.maxZ))).toBeCloseTo(whole.maxZ, 9);
  });

  it.each(flatFamilies)("%s's mass and COM are unchanged by being split", (id) => {
    // The decomposition is a contact-discretisation change and nothing else.
    // If it moved a single gram or a single millimetre of COM it would be
    // altering the physics, which is precisely what it must not do.
    const world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
    const body = createStatueBody(params(id), RAPIER_MODULE, world, 0.65, 0.05);
    const analytic = computeStatueGeometry(params(id));

    expect(body.mass.massKg).toBeCloseTo(PHASE1_BASELINE_STATUE_PARAMS.totalMassKg, 3);
    expect(body.mass.comLocal.z).toBeCloseTo(analytic.comLocalAnalytic.z, 4);
    expect(body.mass.comLocal.x).toBeCloseTo(analytic.comLocalAnalytic.x, 4);

    const base = body.mass.components.find((c) => c.component === "base")!;
    expect(base.colliderCount).toBe(CONTACT_WEDGE_COUNT);
    expect(base.rapierMassKg).toBeCloseTo(
      PHASE1_BASELINE_STATUE_PARAMS.baseMassFraction * PHASE1_BASELINE_STATUE_PARAMS.totalMassKg,
      2
    );
    world.free();
  });

  it("wedges of a convex outline are convex, cover its area, and share only edges", () => {
    const outline = getBaseModule("B2").polytope(params("B2"))!.vertices
      .filter((v) => Math.abs(v.z) < 1e-9)
      .map((v) => ({ x: v.x, y: v.y }));
    const wedges = wedgeDecomposition(outline, CONTACT_WEDGE_COUNT);
    expect(wedges).toHaveLength(CONTACT_WEDGE_COUNT);
    const total = wedges.reduce((sum, w) => sum + footprintArea(w), 0);
    expect(total).toBeCloseTo(footprintArea(outline), 9);
    for (const wedge of wedges) {
      expect(footprintArea(wedge)).toBeGreaterThan(0);
      // Every wedge touches the centroid; that shared apex is what makes the
      // union exact rather than approximate.
      const centre = footprintCentroid(outline);
      expect(wedge.some((p) => Math.hypot(p.x - centre.x, p.y - centre.y) < 1e-9)).toBe(true);
    }
  });

  it("declines to split an outline with too few vertices to share out", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ];
    expect(wedgeDecomposition(triangle, 6)).toHaveLength(1);
  });
});

describe("the static equilibrium benchmark across every family", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s holds a sub-threshold pull, or reports itself inapplicable", (id) => {
    const result = runStaticEquilibriumBenchmark(RAPIER_MODULE, {
      statueParams: params(id),
      roadParams: ROAD,
      ...DEFAULT_STATIC_EQUILIBRIUM
    });

    if (result.notApplicableReason) {
      // Only a rocker may excuse itself, and only because it has no finite
      // tipping lever arm — not because it failed.
      expect(getBaseModule(id).dims(params(id)).contactKind).toBe("rocker");
      return;
    }

    const failures = result.checks.filter((c) => !c.pass).map((c) => `${c.name} = ${c.measured} ${c.unit}`);
    expect(failures, `${id} failed: ${failures.join("; ")}`).toEqual([]);
    expect(result.pass).toBe(true);
  }, 90_000);
});
