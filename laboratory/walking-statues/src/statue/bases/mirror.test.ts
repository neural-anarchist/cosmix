import { describe, expect, it } from "vitest";
import { computeStatueGeometry } from "../geometry";
import { DEFAULT_STATUE_PARAMS } from "../defaults";
import type { BaseFamilyId, StatueParams } from "../types";
import { polytopeBounds, polytopeCentroid, polytopeVolume, type Polytope } from "./polytope";
import {
  ALL_BASE_FAMILY_IDS,
  foreAftMirrorFamily,
  foreAftMirrorParams,
  getBaseModule,
  hasExactForeAftMirror,
  lateralMirrorParams,
  SYMMETRIC_BASE_FAMILY_IDS
} from "./registry";

const params = (id: BaseFamilyId, overrides: Partial<StatueParams> = {}): StatueParams => ({
  ...DEFAULT_STATUE_PARAMS,
  baseFamily: id,
  ...overrides
});

/**
 * The half-width profile of a solid: for each distinct x station, how far the
 * solid reaches in +y and -y. Two solids are geometric mirrors exactly when one
 * profile is the other's, read backwards.
 *
 * Comparing profiles rather than raw vertex lists is deliberate: two shapes can
 * be identical solids with different vertex orderings, and a vertex-by-vertex
 * comparison would be testing the construction order rather than the geometry.
 */
function halfWidthProfile(polytope: Polytope): Map<string, { maxY: number; minY: number }> {
  const profile = new Map<string, { maxY: number; minY: number }>();
  for (const v of polytope.vertices) {
    const key = v.x.toFixed(9);
    const entry = profile.get(key) ?? { maxY: -Infinity, minY: Infinity };
    entry.maxY = Math.max(entry.maxY, v.y);
    entry.minY = Math.min(entry.minY, v.y);
    profile.set(key, entry);
  }
  return profile;
}

function expectForeAftMirroredSolids(a: Polytope, b: Polytope): void {
  expect(polytopeVolume(b)).toBeCloseTo(polytopeVolume(a), 9);
  expect(polytopeCentroid(b).x).toBeCloseTo(-polytopeCentroid(a).x, 9);
  expect(polytopeCentroid(b).z).toBeCloseTo(polytopeCentroid(a).z, 9);

  const boundsA = polytopeBounds(a);
  const boundsB = polytopeBounds(b);
  expect(boundsB.minX).toBeCloseTo(-boundsA.maxX, 9);
  expect(boundsB.maxX).toBeCloseTo(-boundsA.minX, 9);

  const profileA = halfWidthProfile(a);
  const profileB = halfWidthProfile(b);
  expect(profileB.size).toBe(profileA.size);
  let compared = 0;
  for (const [x, entry] of profileA) {
    const mirroredKey = (-Number(x)).toFixed(9);
    const other = profileB.get(mirroredKey) ?? profileB.get(mirroredKey === "-0.000000000" ? "0.000000000" : mirroredKey);
    expect(other, `no mirrored station at x = ${mirroredKey}`).toBeDefined();
    expect(other!.maxY).toBeCloseTo(entry.maxY, 9);
    expect(other!.minY).toBeCloseTo(entry.minY, 9);
    compared++;
  }
  expect(compared).toBeGreaterThan(8);
}

describe("which families have an exact fore-aft mirror", () => {
  it.each(SYMMETRIC_BASE_FAMILY_IDS)("%s is its own mirror", (id) => {
    expect(foreAftMirrorFamily(id)).toBe(id);
    expect(hasExactForeAftMirror(id)).toBe(true);
  });

  it("B2 and B3 are each other's mirror", () => {
    expect(foreAftMirrorFamily("B2")).toBe("B3");
    expect(foreAftMirrorFamily("B3")).toBe("B2");
  });

  it("B5 mirrors onto itself by negating its front/back asymmetry", () => {
    expect(foreAftMirrorFamily("B5")).toBe("B5");
    const mirrored = foreAftMirrorParams(params("B5", { baseFrontBackAsymmetry: 0.4 }))!;
    expect(mirrored.baseFrontBackAsymmetry).toBeCloseTo(-0.4, 12);
  });

  it("reports no mirror for the D-shaped families rather than inventing one", () => {
    // A D-base's rounded nose and flat transom are intrinsic to the outline;
    // no setting of the shared parameters reflects it. Returning something
    // mirror-shaped that is not a mirror would silently invalidate the very
    // control trial it was produced for.
    for (const id of ["B0", "B4", "B6"] as const) {
      expect(foreAftMirrorFamily(id)).toBeNull();
      expect(hasExactForeAftMirror(id)).toBe(false);
      expect(foreAftMirrorParams(params(id))).toBeNull();
    }
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s answers the mirror question one way or the other", (id) => {
    const answer = foreAftMirrorFamily(id);
    expect(answer === null || ALL_BASE_FAMILY_IDS.includes(answer)).toBe(true);
  });
});

describe("B2 and B3 are exact fore-aft reflections", () => {
  it.each([0, 0.3, -0.25])("at front/back asymmetry %s", (f) => {
    const p2 = params("B2", { baseFrontBackAsymmetry: f });
    const p3 = foreAftMirrorParams(p2)!;
    expect(p3.baseFamily).toBe("B3");
    // The asymmetry is *not* negated: B3 is generated as B2's reflection at the
    // same parameter values, so negating it as well would reflect twice.
    expect(p3.baseFrontBackAsymmetry).toBeCloseTo(f, 12);

    expectForeAftMirroredSolids(getBaseModule("B2").polytope(p2)!, getBaseModule("B3").polytope(p3)!);
  });

  it("mirrors the whole statue's centre of mass in x, and nothing else", () => {
    const p2 = params("B2", { baseFrontBackAsymmetry: 0.3 });
    const p3 = foreAftMirrorParams(p2)!;
    const g2 = computeStatueGeometry(p2);
    const g3 = computeStatueGeometry(p3);

    expect(g3.comLocalAnalytic.x).toBeCloseTo(-g2.comLocalAnalytic.x, 9);
    expect(g3.comLocalAnalytic.y).toBeCloseTo(g2.comLocalAnalytic.y, 9);
    expect(g3.comLocalAnalytic.z).toBeCloseTo(g2.comLocalAnalytic.z, 9);
    expect(Math.abs(g2.comLocalAnalytic.x)).toBeGreaterThan(1e-4);
  });

  it("keeps the contact lever arm and footprint area identical, so only fore-aft shape differs", () => {
    const p2 = params("B2", { baseFrontBackAsymmetry: 0.3 });
    const p3 = foreAftMirrorParams(p2)!;
    const d2 = getBaseModule("B2").dims(p2);
    const d3 = getBaseModule("B3").dims(p3);
    expect(d3.footprintAreaM2!).toBeCloseTo(d2.footprintAreaM2!, 9);
    expect(d3.contactHalfWidthY).toBeCloseTo(d2.contactHalfWidthY, 9);
    expect(d3.volumeM3).toBeCloseTo(d2.volumeM3, 9);
    expect(d3.widthY).toBeCloseTo(d2.widthY, 9);
    expect(d3.lengthX).toBeCloseTo(d2.lengthX, 9);
  });

  it("B3 is not simply B2 — the pair is a real control, not a relabelling", () => {
    const p2 = params("B2", { baseFrontBackAsymmetry: 0.3 });
    const g2 = computeStatueGeometry(p2);
    const g3 = computeStatueGeometry(foreAftMirrorParams(p2)!);
    expect(g3.base.comLocal.x).not.toBeCloseTo(g2.base.comLocal.x, 4);
  });
});

describe("B5 mirrors onto itself", () => {
  it("negating the front/back asymmetry reflects the solid", () => {
    const forward = params("B5", { baseFrontBackAsymmetry: 0.45 });
    const mirrored = foreAftMirrorParams(forward)!;
    expectForeAftMirroredSolids(
      getBaseModule("B5").polytope(forward)!,
      getBaseModule("B5").polytope(mirrored)!
    );
  });

  it("a symmetric B5 is its own reflection", () => {
    const symmetric = params("B5", { baseFrontBackAsymmetry: 0 });
    const a = getBaseModule("B5").polytope(symmetric)!;
    expectForeAftMirroredSolids(a, getBaseModule("B5").polytope(foreAftMirrorParams(symmetric)!)!);
    expect(Math.abs(polytopeCentroid(a).x)).toBeLessThan(1e-9);
  });
});

describe("the fore-aft mirror negates every directional quantity", () => {
  it("reverses lean, base offset and any forward COM offset", () => {
    const forward = params("B2", {
      forwardLeanDeg: 8,
      baseOffsetXRatio: 0.05,
      baseForwardLeanDeg: 6,
      comOverrideEnabled: true,
      comOffsetXRatio: 0.04
    });
    const mirrored = foreAftMirrorParams(forward)!;
    expect(mirrored.forwardLeanDeg).toBe(-8);
    expect(mirrored.baseOffsetXRatio).toBeCloseTo(-0.05, 12);
    expect(mirrored.baseForwardLeanDeg).toBe(-6);
    expect(mirrored.comOffsetXRatio).toBeCloseTo(-0.04, 12);
  });

  it("leaves every lateral and vertical quantity alone", () => {
    const forward = params("B2", { baseLeftRightAsymmetry: 0.2, comOffsetYRatio: 0.03, comHeightRatio: 0.4 });
    const mirrored = foreAftMirrorParams(forward)!;
    expect(mirrored.baseLeftRightAsymmetry).toBe(0.2);
    expect(mirrored.comOffsetYRatio).toBe(0.03);
    expect(mirrored.comHeightRatio).toBe(0.4);
    expect(mirrored.totalMassKg).toBe(forward.totalMassKg);
    expect(mirrored.heightM).toBe(forward.heightM);
  });

  it("is its own inverse for a symmetric family, and for the B2/B3 pair", () => {
    for (const id of ["A0", "A5", "B2", "B5"] as const) {
      const original = params(id, { forwardLeanDeg: 5, baseFrontBackAsymmetry: 0.2 });
      const round = foreAftMirrorParams(foreAftMirrorParams(original)!)!;
      expect(round.baseFamily).toBe(original.baseFamily);
      expect(round.forwardLeanDeg).toBe(original.forwardLeanDeg);
      expect(round.baseFrontBackAsymmetry).toBeCloseTo(original.baseFrontBackAsymmetry, 12);
    }
  });
});

describe("the lateral mirror is exact for every family", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s reflects left-to-right", (id) => {
    const skewed = params(id, { baseLeftRightAsymmetry: 0.3 });
    const mirrored = lateralMirrorParams(skewed);
    expect(mirrored.baseLeftRightAsymmetry).toBeCloseTo(-0.3, 12);

    const a = getBaseModule(id).dims(skewed);
    const b = getBaseModule(id).dims(mirrored);
    expect(b.contactHalfWidthYLeft).toBeCloseTo(a.contactHalfWidthYRight, 9);
    expect(b.contactHalfWidthYRight).toBeCloseTo(a.contactHalfWidthYLeft, 9);
    expect(b.widthY).toBeCloseTo(a.widthY, 9);
    expect(b.volumeM3).toBeCloseTo(a.volumeM3, 9);
    expect(b.comLocal.y).toBeCloseTo(-a.comLocal.y, 9);
  });

  it("a laterally skewed base really does have unequal tipping arms", () => {
    const skewed = getBaseModule("A2").dims(params("A2", { baseLeftRightAsymmetry: 0.3 }));
    expect(skewed.contactHalfWidthYLeft).toBeGreaterThan(skewed.contactHalfWidthYRight * 1.5);
    // The governing arm is the smaller one: that is the side that gives way first.
    expect(skewed.contactHalfWidthY).toBeCloseTo(skewed.contactHalfWidthYRight, 12);
  });

  it("is its own inverse", () => {
    const original = params("B0", { baseLeftRightAsymmetry: 0.25, comOffsetYRatio: 0.06 });
    const round = lateralMirrorParams(lateralMirrorParams(original));
    expect(round.baseLeftRightAsymmetry).toBeCloseTo(0.25, 12);
    expect(round.comOffsetYRatio).toBeCloseTo(0.06, 12);
  });
});
