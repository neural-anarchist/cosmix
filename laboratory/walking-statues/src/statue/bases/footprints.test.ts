import { describe, expect, it } from "vitest";
import {
  applyLateralAsymmetry,
  convexHull2D,
  dShapeFootprint,
  ellipseFootprint,
  footprintArea,
  footprintBounds,
  footprintIsConvex,
  rectangleFootprint,
  roundedRectangleFootprint,
  stadiumFootprint,
  teardropFootprint
} from "./footprints";
import { FOOTPRINT_SEGMENTS } from "./polytopeFamily";

const L = 0.77;
const W = 1.12;
const SEG = FOOTPRINT_SEGMENTS;

/** Every footprint the families build, at the default statue's proportions —
 * which are deliberately *wider than long*, the case that breaks naive
 * circular-cap constructions. */
const ALL_FOOTPRINTS = {
  rectangle: rectangleFootprint(L, W),
  roundedRect: roundedRectangleFootprint(L, W, 0.105, 8),
  ellipse: ellipseFootprint(L, W, SEG),
  stadium: stadiumFootprint(L, W, SEG),
  dShape: dShapeFootprint(L, W, 0, SEG),
  teardrop: teardropFootprint(L, W, 0.28, 0, SEG)
};

describe("convexHull2D", () => {
  it("discards interior points", () => {
    const hull = convexHull2D([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 }
    ]);
    expect(hull).toHaveLength(4);
  });

  it("discards collinear points, so no zero-area triangle reaches the extrusion", () => {
    const hull = convexHull2D([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]);
    expect(hull).toHaveLength(4);
  });

  it("winds counter-clockwise, giving a positive signed area", () => {
    expect(footprintArea(convexHull2D(ALL_FOOTPRINTS.rectangle))).toBeGreaterThan(0);
  });
});

describe("every family footprint", () => {
  it.each(Object.entries(ALL_FOOTPRINTS))("%s is convex", (_name, footprint) => {
    expect(footprintIsConvex(footprint)).toBe(true);
  });

  it.each(Object.entries(ALL_FOOTPRINTS))("%s spans exactly L and W", (_name, footprint) => {
    const b = footprintBounds(footprint);
    expect(b.maxX - b.minX).toBeCloseTo(L, 9);
    expect(b.maxY - b.minY).toBeCloseTo(W, 9);
  });

  it.each(Object.entries(ALL_FOOTPRINTS))("%s has positive area below its bounding box", (_name, footprint) => {
    const area = footprintArea(footprint);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThanOrEqual(L * W + 1e-12);
  });
});

describe("shape identities", () => {
  it("an ellipse's area matches pi/4 of its bounding box", () => {
    const fine = ellipseFootprint(L, W, 512);
    expect(footprintArea(fine)).toBeCloseTo((Math.PI / 4) * L * W, 4);
  });

  it("rounding the corners removes area but not extent", () => {
    const plain = footprintArea(rectangleFootprint(L, W));
    const rounded = footprintArea(roundedRectangleFootprint(L, W, 0.105, 16));
    expect(rounded).toBeLessThan(plain);
    // Exactly the four corner offcuts: r^2 (4 - pi).
    expect(plain - rounded).toBeCloseTo(0.105 ** 2 * (4 - Math.PI), 3);
  });

  it("a zero corner radius reproduces the plain rectangle exactly", () => {
    expect(roundedRectangleFootprint(L, W, 0, 8)).toEqual(rectangleFootprint(L, W));
  });

  it("a stadium longer than it is wide keeps straight full-width sides", () => {
    const long = stadiumFootprint(1.4, 0.5, SEG);
    const b = footprintBounds(long);
    expect(b.maxX - b.minX).toBeCloseTo(1.4, 9);
    expect(b.maxY - b.minY).toBeCloseTo(0.5, 9);
    // Strictly more area than the ellipse on the same bounding box, because of
    // the straight central section.
    expect(footprintArea(long)).toBeGreaterThan(footprintArea(ellipseFootprint(1.4, 0.5, SEG)));
  });

  it("a stadium shorter than it is wide degenerates to the ellipse, keeping both stated dimensions", () => {
    // Geometrically unavoidable: semicircular caps of radius W/2 are themselves
    // W long. Flattening them is what keeps L_base honest.
    const wide = stadiumFootprint(L, W, SEG);
    expect(footprintArea(wide)).toBeCloseTo(footprintArea(ellipseFootprint(L, W, SEG)), 9);
    const b = footprintBounds(wide);
    expect(b.maxX - b.minX).toBeCloseTo(L, 9);
  });

  it("a teardrop is genuinely tapered — narrower at the tail than an ellipse would be", () => {
    const teardrop = teardropFootprint(L, W, 0.2, 0, SEG);
    const ellipse = ellipseFootprint(L, W, SEG);
    // Regression for a real defect: sampling the whole nose ellipse rather than
    // its forward half swallowed the tail disc and silently produced an ellipse.
    expect(footprintArea(teardrop)).toBeLessThan(footprintArea(ellipse) * 0.95);
    const tailWidth = Math.max(...teardrop.filter((p) => p.x < -L / 2 + 0.02).map((p) => Math.abs(p.y)));
    expect(tailWidth).toBeLessThan(W / 4);
  });

  it("a D-base is widest at its centre and flat across the rear", () => {
    const d = dShapeFootprint(L, W, 0, SEG);
    const rearX = footprintBounds(d).minX;
    const rearPoints = d.filter((p) => Math.abs(p.x - rearX) < 1e-9);
    expect(rearPoints.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...rearPoints.map((p) => Math.abs(p.y)))).toBeCloseTo(W / 2, 9);
    // The nose narrows: no point at the front extreme carries full width.
    const noseX = footprintBounds(d).maxX;
    const nosePoints = d.filter((p) => Math.abs(p.x - noseX) < 1e-9);
    expect(Math.max(...nosePoints.map((p) => Math.abs(p.y)))).toBeLessThan(W / 4);
  });
});

describe("asymmetry controls preserve the stated size", () => {
  it.each([-0.4, -0.1, 0, 0.25, 0.5])("lateral asymmetry %s keeps total width exactly W", (a) => {
    const skewed = applyLateralAsymmetry(ellipseFootprint(L, W, SEG), a);
    const b = footprintBounds(skewed);
    expect(b.maxY - b.minY).toBeCloseTo(W, 9);
    expect(b.maxY).toBeCloseTo((W / 2) * (1 + a), 9);
    expect(-b.minY).toBeCloseTo((W / 2) * (1 - a), 9);
  });

  it("lateral asymmetry keeps the result convex", () => {
    for (const a of [-0.5, -0.2, 0.2, 0.5]) {
      expect(footprintIsConvex(applyLateralAsymmetry(ellipseFootprint(L, W, SEG), a))).toBe(true);
      expect(footprintIsConvex(applyLateralAsymmetry(dShapeFootprint(L, W, 0.3, SEG), a))).toBe(true);
    }
  });

  it("zero lateral asymmetry is an exact no-op", () => {
    const base = dShapeFootprint(L, W, 0.2, SEG);
    expect(applyLateralAsymmetry(base, 0)).toEqual(base);
  });

  it.each([-0.6, -0.2, 0, 0.3, 0.7])("front/back asymmetry %s keeps total length exactly L", (f) => {
    for (const footprint of [dShapeFootprint(L, W, f, SEG), teardropFootprint(L, W, 0.2, f, SEG)]) {
      const b = footprintBounds(footprint);
      expect(b.maxX - b.minX).toBeCloseTo(L, 9);
      expect(b.maxX).toBeCloseTo((L / 2) * (1 + f), 9);
    }
  });
});

describe("validation", () => {
  it("rejects a teardrop whose asymmetry would eliminate its nose or tail", () => {
    expect(() => teardropFootprint(L, W, 0.2, 1, SEG)).toThrow(/non-positive nose or tail/);
    expect(() => teardropFootprint(L, W, 0.2, -1, SEG)).toThrow(/non-positive nose or tail/);
  });

  it("clamps a tail radius wider than the base to the half-width rather than inverting the shape", () => {
    const clamped = teardropFootprint(L, W, 10, 0, SEG);
    expect(footprintIsConvex(clamped)).toBe(true);
    expect(footprintBounds(clamped).maxY - footprintBounds(clamped).minY).toBeCloseTo(W, 9);
  });
});
