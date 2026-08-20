import { beforeAll, describe, expect, it } from "vitest";
import type * as RAPIER from "@dimforge/rapier3d-compat";
import { GRAVITY_M_S2 } from "../../core/constants";
import { getRapier, type RapierModule } from "../../physics/rapierSetup";
import { createStatueBody, type StatueBody } from "../body";
import { DEFAULT_STATUE_PARAMS, PHASE1_BASELINE_STATUE_PARAMS } from "../defaults";
import { computeStatueGeometry } from "../geometry";
import type { BaseFamilyId, StatueParams } from "../types";
import { footprintIsConvex } from "./footprints";
import { polytopeBounds, polytopeVolume } from "./polytope";
import { ALL_BASE_FAMILY_IDS, getBaseModule, SYMMETRIC_BASE_FAMILY_IDS } from "./registry";
import { SHARED_BASE_PARAMETERS, SHARED_BASE_PARAM_RANGES } from "./shared";

let RAPIER_MODULE: RapierModule;

beforeAll(async () => {
  RAPIER_MODULE = await getRapier();
}, 30_000);

function build(overrides: Partial<StatueParams> = {}): { body: StatueBody; world: RAPIER.World } {
  const world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
  const body = createStatueBody(
    { ...DEFAULT_STATUE_PARAMS, ...overrides },
    RAPIER_MODULE,
    world,
    0.65,
    0.05
  );
  return { body, world };
}

const params = (id: BaseFamilyId, overrides: Partial<StatueParams> = {}): StatueParams => ({
  ...DEFAULT_STATUE_PARAMS,
  baseFamily: id,
  ...overrides
});

describe("the registry covers the declared roadmap", () => {
  it("implements every family the UI offers, with no disabled placeholders", () => {
    expect(ALL_BASE_FAMILY_IDS).toEqual(["A0", "A1", "A2", "A3", "A4", "A5", "B0", "B2", "B3", "B4", "B5", "B6"]);
    for (const id of ALL_BASE_FAMILY_IDS) {
      expect(getBaseModule(id).id).toBe(id);
    }
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s declares a label, a summary and a collider approximation", (id) => {
    const module = getBaseModule(id);
    expect(module.label).toContain(id);
    expect(module.summary.length).toBeGreaterThan(20);
    expect(module.colliderApproximation(params(id)).length).toBeGreaterThan(20);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s declares which shared parameters it reads", (id) => {
    const used = getBaseModule(id).usesParameters;
    expect(used.length).toBeGreaterThan(0);
    const known = SHARED_BASE_PARAMETERS.map((p) => p.id);
    for (const parameter of used) expect(known).toContain(parameter);
    // Mass fraction and the two plan extents are the irreducible minimum: a
    // family that read none of them would not be describable in the shared
    // schema at all.
    expect(used).toContain("baseMassFraction");
    expect(used).toContain("baseWidthRatio");
    expect(used).toContain("baseLengthRatio");
  });
});

describe("every family builds a well-formed solid", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s reports positive volume and a sane top", (id) => {
    const dims = getBaseModule(id).dims(params(id));
    expect(dims.volumeM3).toBeGreaterThan(0);
    expect(dims.topZ).toBeGreaterThan(0);
    expect(dims.lengthX).toBeGreaterThan(0);
    expect(dims.widthY).toBeGreaterThan(0);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s spans exactly the requested W_base and L_base", (id) => {
    // The shared schema is worth nothing if a family quietly reinterprets its
    // extents — a later matched comparison would then be varying size as well
    // as shape without saying so.
    const p = params(id);
    const dims = getBaseModule(id).dims(p);
    expect(dims.widthY).toBeCloseTo(p.baseWidthRatio * p.heightM, 6);
    expect(dims.lengthX).toBeCloseTo(p.baseLengthRatio * p.heightM, 6);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s classifies its ground contact consistently with its lever arm", (id) => {
    const dims = getBaseModule(id).dims(params(id));
    if (dims.contactKind === "rocker") {
      expect(dims.contactHalfWidthY).toBe(0);
      expect(dims.footprintAreaM2).toBeNull();
    } else {
      expect(dims.contactHalfWidthY).toBeGreaterThan(0);
      expect(dims.footprintAreaM2).toBeGreaterThan(0);
    }
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s agrees with its own polytope, where it has one", (id) => {
    const module = getBaseModule(id);
    const polytope = module.polytope(params(id));
    if (!polytope) {
      // A0 and A4 keep their exact analytic primitives on purpose.
      expect(["A0", "A4"]).toContain(id);
      return;
    }
    const dims = module.dims(params(id));
    const bounds = polytopeBounds(polytope);
    expect(polytopeVolume(polytope)).toBeCloseTo(dims.volumeM3, 9);
    expect(bounds.maxX - bounds.minX).toBeCloseTo(dims.lengthX, 9);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(dims.widthY, 9);
  });
});

describe("mass, COM and inertia", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s lands on exactly the requested total mass", (id) => {
    const { body, world } = build({ baseFamily: id });
    expect(body.mass.massKg).toBeCloseTo(DEFAULT_STATUE_PARAMS.totalMassKg, 2);
    world.free();
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s gives the base exactly its mass fraction", (id) => {
    const { body, world } = build({ baseFamily: id });
    const base = body.mass.components.find((c) => c.component === "base")!;
    const expected = DEFAULT_STATUE_PARAMS.baseMassFraction * DEFAULT_STATUE_PARAMS.totalMassKg;
    // The hull Rapier builds can enclose slightly less than the polytope handed
    // to it, so the density is rescaled against the collider's own volume. This
    // is the assertion that the rescale is actually happening.
    expect(base.rapierMassKg).toBeCloseTo(expected, 2);
    expect(base.targetMassKg).toBeCloseTo(expected, 9);
    world.free();
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s has an analytic COM that agrees with Rapier's", (id) => {
    const { body, world } = build({ baseFamily: id });
    const analytic = body.geometry.comLocalAnalytic;
    const rapier = body.mass.comLocal;
    // 1 mm on a 3.5 m statue. The hull-backed rockers carry a faceting deficit
    // concentrated at their tips (A5's hull encloses ~1.25% less than its design
    // polytope); everything else agrees to well under a micron.
    expect(Math.abs(rapier.x - analytic.x)).toBeLessThan(1e-3);
    expect(Math.abs(rapier.y - analytic.y)).toBeLessThan(1e-3);
    expect(Math.abs(rapier.z - analytic.z)).toBeLessThan(1e-3);
    world.free();
  });

  it("reports each component's volume, density and resulting mass separately", () => {
    const { body, world } = build({ baseFamily: "B0" });
    expect(body.mass.components.map((c) => c.component)).toEqual(["base", "torso", "head"]);
    for (const c of body.mass.components) {
      expect(c.volumeM3).toBeGreaterThan(0);
      expect(c.colliderVolumeM3).toBeGreaterThan(0);
      expect(c.densityKgPerM3).toBeGreaterThan(0);
      expect(c.densityKgPerM3 * c.colliderVolumeM3).toBeCloseTo(c.rapierMassKg, 3);
    }
    world.free();
  });

  it("places a half-ellipsoid rocker's COM above where a prism assumption would put it", () => {
    // A5's base centroid sits at five-eighths of its height, not one half. If
    // BaseDims still assumed half-height, this is the test that would catch it.
    const a5 = computeStatueGeometry(params("A5"));
    expect(a5.base.comLocal.z).toBeGreaterThan(a5.base.topZ * 0.55);
    expect(a5.base.comLocal.z).toBeLessThan(a5.base.topZ * 0.7);
  });

  it("puts a D-base's centroid behind its widest point, and an offset base's ahead of it", () => {
    const b0 = computeStatueGeometry(params("B0"));
    expect(b0.base.comLocal.x).toBeLessThan(0);

    const shifted = computeStatueGeometry(params("B4", { baseOffsetXRatio: 0.1 }));
    const unshifted = computeStatueGeometry(params("B4", { baseOffsetXRatio: 0 }));
    expect(shifted.base.comLocal.x - unshifted.base.comLocal.x).toBeCloseTo(
      0.1 * DEFAULT_STATUE_PARAMS.heightM,
      6
    );
    expect(shifted.base.offsetX).toBeCloseTo(0.1 * DEFAULT_STATUE_PARAMS.heightM, 9);
  });
});

describe("parameter validation", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s accepts its own defaults", (id) => {
    expect(() => getBaseModule(id).validate(params(id))).not.toThrow();
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s rejects every parameter it reads when driven out of range", (id) => {
    const module = getBaseModule(id);
    for (const parameter of module.usesParameters) {
      const range = SHARED_BASE_PARAM_RANGES[parameter];
      expect(() => module.validate(params(id, { [parameter]: range.max + 1 }))).toThrow(
        new RegExp(`"${parameter}"`)
      );
      expect(() => module.validate(params(id, { [parameter]: Number.NaN }))).toThrow(
        new RegExp(`"${parameter}"`)
      );
    }
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s ignores out-of-range values in parameters it does not read", (id) => {
    // Carrying one parameter set across families is the whole point of a shared
    // schema; failing a family for a control it never touches would defeat it.
    const module = getBaseModule(id);
    const unused = SHARED_BASE_PARAMETERS.map((p) => p.id).filter(
      (p) => !module.usesParameters.includes(p)
    );
    for (const parameter of unused) {
      expect(() => module.validate(params(id, { [parameter]: 99 }))).not.toThrow();
    }
  });

  it("rejects a B6 mount lean steep enough to cut its own base through the ground", () => {
    expect(() =>
      getBaseModule("B6").dims(params("B6", { baseForwardLeanDeg: 30, baseHeightRatio: 0.06, baseLengthRatio: 0.5 }))
    ).toThrow(/cut the mounting plane through the ground/);
  });

  it("rejects an A5 whose curvature radius would flatten it to nothing", () => {
    expect(() =>
      getBaseModule("A5").dims(params("A5", { baseWidthRatio: 0.12, baseLateralRadiusRatio: 0.6 }))
    ).not.toThrow();
    // Reachable only outside the slider range, so it is checked directly.
    expect(() => getBaseModule("A5").dims(params("A5", { baseLateralRadiusRatio: 1e9 }))).toThrow();
  });
});

describe("A0 and A4 are preserved exactly", () => {
  it("A0's dims are unchanged from the validated Phase 1 formulas", () => {
    const p = PHASE1_BASELINE_STATUE_PARAMS;
    const d = getBaseModule("A0").dims(p);
    expect(d.lengthX).toBeCloseTo(p.baseLengthRatio * p.heightM, 12);
    expect(d.widthY).toBeCloseTo(p.baseWidthRatio * p.heightM, 12);
    expect(d.topZ).toBeCloseTo(p.baseHeightRatio * p.heightM, 12);
    expect(d.contactHalfWidthY).toBeCloseTo((p.baseWidthRatio * p.heightM) / 2, 12);
    expect(d.contactKind).toBe("flat");
    expect(d.comLocal.z).toBeCloseTo(d.topZ / 2, 12);
  });

  it("A0 and A4 keep analytic primitives rather than hulls", () => {
    expect(getBaseModule("A0").polytope(PHASE1_BASELINE_STATUE_PARAMS)).toBeNull();
    expect(getBaseModule("A4").polytope(PHASE1_BASELINE_STATUE_PARAMS)).toBeNull();
    expect(getBaseModule("A0").colliderApproximation(PHASE1_BASELINE_STATUE_PARAMS)).toMatch(/Exact/);
    expect(getBaseModule("A4").colliderApproximation(PHASE1_BASELINE_STATUE_PARAMS)).toMatch(/Exact/);
  });

  it("A4 still reports rocker contact with no tipping lever arm", () => {
    const d = getBaseModule("A4").dims({ ...PHASE1_BASELINE_STATUE_PARAMS, baseFamily: "A4" });
    expect(d.contactKind).toBe("rocker");
    expect(d.contactHalfWidthY).toBe(0);
    expect(d.topZ).toBeCloseTo(PHASE1_BASELINE_STATUE_PARAMS.baseWidthRatio * PHASE1_BASELINE_STATUE_PARAMS.heightM, 12);
  });

  it("the Phase 1 baseline statue is untouched by every Step 2 shape control", () => {
    const { body: reference, world: w1 } = build({ ...PHASE1_BASELINE_STATUE_PARAMS });
    const { body: perturbed, world: w2 } = build({
      ...PHASE1_BASELINE_STATUE_PARAMS,
      // Everything A0 declares it does not read, pushed to its limits.
      baseLateralRadiusRatio: 0.6,
      baseForeAftRadiusRatio: 0.6,
      baseEdgeRoundingRatio: 0.12,
      baseFrontBackAsymmetry: 0.8,
      baseLeftRightAsymmetry: 0.5,
      baseOffsetXRatio: 0.15,
      baseForwardLeanDeg: 30
    });
    expect(perturbed.mass.massKg).toBeCloseTo(reference.mass.massKg, 9);
    expect(perturbed.mass.comLocal.x).toBeCloseTo(reference.mass.comLocal.x, 9);
    expect(perturbed.mass.comLocal.y).toBeCloseTo(reference.mass.comLocal.y, 9);
    expect(perturbed.mass.comLocal.z).toBeCloseTo(reference.mass.comLocal.z, 9);
    expect(perturbed.mass.principalInertia.x).toBeCloseTo(reference.mass.principalInertia.x, 6);
    expect(perturbed.geometry.base.volumeM3).toBeCloseTo(reference.geometry.base.volumeM3, 12);
    w1.free();
    w2.free();
  });
});

describe("base-driven forward lean", () => {
  it("B6's angled mounting plane leans the upper body without tilting the footprint", () => {
    const level = computeStatueGeometry(params("B6", { baseForwardLeanDeg: 0 }));
    const leaned = computeStatueGeometry(params("B6", { baseForwardLeanDeg: 12 }));

    expect((leaned.baseMountLeanRad * 180) / Math.PI).toBeCloseTo(12, 9);
    expect(leaned.bodyLeanRad).toBe(0);
    expect((leaned.forwardLeanRad * 180) / Math.PI).toBeCloseTo(12, 9);

    // The ground contact is identical: same footprint area, same lever arm.
    expect(leaned.base.footprintAreaM2).toBeCloseTo(level.base.footprintAreaM2!, 12);
    expect(leaned.base.contactHalfWidthY).toBeCloseTo(level.base.contactHalfWidthY, 12);
    // But the upper body has moved forward.
    expect(leaned.torsoPlacement.position.x).toBeGreaterThan(level.torsoPlacement.position.x + 0.05);
  });

  it("adds the base's mount lean to the statue's own lean rather than replacing it", () => {
    const both = computeStatueGeometry(params("B6", { baseForwardLeanDeg: 7, forwardLeanDeg: 5 }));
    expect((both.forwardLeanRad * 180) / Math.PI).toBeCloseTo(12, 9);
    expect((both.bodyLeanRad * 180) / Math.PI).toBeCloseTo(5, 9);
    expect((both.baseMountLeanRad * 180) / Math.PI).toBeCloseTo(7, 9);
  });

  it("mounts the torso on the plane's centreline height, not on the base's tallest corner", () => {
    const leaned = getBaseModule("B6").dims(params("B6", { baseForwardLeanDeg: 12 }));
    const level = getBaseModule("B6").dims(params("B6", { baseForwardLeanDeg: 0 }));
    expect(leaned.topZ).toBeCloseTo(level.topZ, 12);
  });
});

describe("footprint convexity holds for every flat family as built", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s", (id) => {
    const module = getBaseModule(id);
    const polytope = module.polytope(params(id, { baseLeftRightAsymmetry: 0.3, baseFrontBackAsymmetry: 0.3 }));
    if (!polytope) return;
    const dims = module.dims(params(id, { baseLeftRightAsymmetry: 0.3, baseFrontBackAsymmetry: 0.3 }));
    if (dims.contactKind !== "flat") return;
    // The bottom ring of an extruded prism is the footprint.
    const bottom = polytope.vertices.filter((v) => Math.abs(v.z) < 1e-12).map((v) => ({ x: v.x, y: v.y }));
    expect(footprintIsConvex(bottom)).toBe(true);
  });
});

describe("the symmetric families really are symmetric", () => {
  it.each(SYMMETRIC_BASE_FAMILY_IDS)("%s has a base centroid on the origin in x and y", (id) => {
    const geometry = computeStatueGeometry(params(id));
    expect(Math.abs(geometry.base.comLocal.x)).toBeLessThan(1e-9);
    expect(Math.abs(geometry.base.comLocal.y)).toBeLessThan(1e-9);
  });

  it("the asymmetric families do not", () => {
    for (const id of ["B0", "B2", "B3", "B6"] as const) {
      expect(Math.abs(computeStatueGeometry(params(id)).base.comLocal.x)).toBeGreaterThan(1e-4);
    }
  });
});
