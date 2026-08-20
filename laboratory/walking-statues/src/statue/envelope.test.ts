import { describe, expect, it } from "vitest";
import { ALL_BASE_FAMILY_IDS } from "./bases/registry";
import { PHASE1_BASELINE_STATUE_PARAMS } from "./defaults";
import { bodyContainsPoint, pointInConvexPolygon } from "./envelope";
import { computeStatueGeometry } from "./geometry";
import type { BaseFamilyId } from "./types";

const params = (id: BaseFamilyId) => ({ ...PHASE1_BASELINE_STATUE_PARAMS, baseFamily: id });

describe("body containment", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s contains its own centre of mass", (id) => {
    const p = params(id);
    const geometry = computeStatueGeometry(p);
    expect(bodyContainsPoint(p, geometry, geometry.comLocalAnalytic)).toBe(true);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s excludes a point well outside it", (id) => {
    const p = params(id);
    const geometry = computeStatueGeometry(p);
    expect(bodyContainsPoint(p, geometry, { x: 5, y: 5, z: 5 })).toBe(false);
    expect(bodyContainsPoint(p, geometry, { x: 0, y: 0, z: -0.5 })).toBe(false);
  });

  it("is stricter than the bounding box where the statue is narrow", () => {
    // The point of the whole containment test: at shoulder height the statue is
    // a 0.56 m deep torso inside a 0.77 m long base's bounding box, so a third
    // of that slice of the box is air.
    const p = params("B0");
    const geometry = computeStatueGeometry(p);
    const inBoxButOutsideBody = { x: 0.373, y: 0, z: 1.648 };
    expect(inBoxButOutsideBody.x).toBeLessThan(geometry.envelope.max.x);
    expect(inBoxButOutsideBody.z).toBeLessThan(geometry.envelope.max.z);
    expect(bodyContainsPoint(p, geometry, inBoxButOutsideBody)).toBe(false);
    expect(bodyContainsPoint(p, geometry, { x: 0.27, y: 0, z: 1.648 })).toBe(true);
  });

  it("respects a curved footprint rather than its bounding rectangle", () => {
    // An elliptical base's bounding-box corner is outside the ellipse.
    const p = params("A2");
    const geometry = computeStatueGeometry(p);
    const corner = { x: geometry.base.maxX * 0.95, y: geometry.base.maxY * 0.95, z: 0.1 };
    expect(bodyContainsPoint(p, geometry, corner)).toBe(false);
    expect(bodyContainsPoint(p, geometry, { x: 0, y: geometry.base.maxY * 0.95, z: 0.1 })).toBe(true);
  });

  it("follows the torso when the upper body is leaned", () => {
    const upright = { ...params("A0"), forwardLeanDeg: 0 };
    const leaned = { ...params("A0"), forwardLeanDeg: 25 };
    const leanedGeometry = computeStatueGeometry(leaned);
    // The leaned torso's own centre: inside the leaned statue by construction,
    // and far enough forward to be outside the upright one.
    const probe = leanedGeometry.torsoPlacement.position;
    expect(probe.x).toBeGreaterThan(0.3);
    expect(bodyContainsPoint(leaned, leanedGeometry, probe)).toBe(true);
    expect(bodyContainsPoint(upright, computeStatueGeometry(upright), probe)).toBe(false);
  });

  it("includes the head sphere", () => {
    const p = params("A0");
    const geometry = computeStatueGeometry(p);
    expect(bodyContainsPoint(p, geometry, geometry.headPlacement.position)).toBe(true);
  });
});

describe("the envelope box", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s encloses the base, torso and head", (id) => {
    const geometry = computeStatueGeometry(params(id));
    expect(geometry.envelope.min.z).toBeLessThanOrEqual(0);
    expect(geometry.envelope.max.z).toBeGreaterThanOrEqual(
      geometry.headPlacement.position.z + geometry.head.radius - 1e-9
    );
    expect(geometry.envelope.min.x).toBeLessThanOrEqual(geometry.base.minX + 1e-9);
    expect(geometry.envelope.max.x).toBeGreaterThanOrEqual(geometry.base.maxX - 1e-9);
  });

  it("grows forward when the upper body leans, rather than assuming an upright box", () => {
    const upright = computeStatueGeometry({ ...params("A0"), forwardLeanDeg: 0 });
    const leaned = computeStatueGeometry({ ...params("A0"), forwardLeanDeg: 25 });
    expect(leaned.envelope.max.x).toBeGreaterThan(upright.envelope.max.x + 0.1);
  });
});

describe("convex polygon containment", () => {
  const square = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 }
  ];

  it("accepts interior and boundary points and rejects exterior ones", () => {
    expect(pointInConvexPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(pointInConvexPolygon({ x: 1, y: 0 }, square)).toBe(true);
    expect(pointInConvexPolygon({ x: 1.001, y: 0 }, square)).toBe(false);
    expect(pointInConvexPolygon({ x: 0, y: 2 }, square)).toBe(false);
  });
});
