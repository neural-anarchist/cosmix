import { describe, expect, it } from "vitest";
import { length } from "../core/vec3";
import { mirrorRopeGeometry, solveRope, type RopeGeometry } from "./ropeModel";

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const ORIGIN = { x: 0, y: 0, z: 0 };

const GEOM: RopeGeometry = {
  externalAnchor: { x: 3, y: 4, z: 0 },
  attachmentLocal: { x: 0, y: 0, z: 0 }
};

describe("solveRope", () => {
  it("points from the attachment toward the haulers, normalized", () => {
    const s = solveRope("left", GEOM, 100, true, ORIGIN, IDENTITY, ORIGIN);
    expect(s.direction.x).toBeCloseTo(0.6, 12);
    expect(s.direction.y).toBeCloseTo(0.8, 12);
    expect(length(s.direction)).toBeCloseTo(1, 12);
    expect(s.ropeLengthM).toBeCloseTo(5, 12);
    expect(s.force.x).toBeCloseTo(60, 12);
    expect(s.force.y).toBeCloseTo(80, 12);
  });

  it("applies no force when the rope is not being hauled, but keeps its geometry", () => {
    const s = solveRope("left", GEOM, 100, false, ORIGIN, IDENTITY, ORIGIN);
    expect(s.active).toBe(false);
    expect(s.tensionN).toBe(0);
    expect(length(s.force)).toBe(0);
    expect(length(s.torqueAboutCom)).toBe(0);
    // Direction is still reported so the UI can preview where a pull would go.
    expect(length(s.direction)).toBeCloseTo(1, 12);
  });

  it("can only pull: the force is always along attachment -> anchor", () => {
    // Whatever the tension, the force never points away from the puller, so the
    // dot product with the rope direction is never negative.
    for (const tensionN of [1, 500, 25000]) {
      const s = solveRope("left", GEOM, tensionN, true, ORIGIN, IDENTITY, ORIGIN);
      const dot = s.force.x * s.direction.x + s.force.y * s.direction.y + s.force.z * s.direction.z;
      expect(dot).toBeCloseTo(tensionN, 9);
    }
  });

  it("computes torque about the COM, not about the body origin", () => {
    // Attachment 2 m above the COM, pulling in +y: tau = r x F = (-2T, 0, 0).
    const geom: RopeGeometry = {
      externalAnchor: { x: 0, y: 10, z: 2 },
      attachmentLocal: { x: 0, y: 0, z: 2 }
    };
    const com = { x: 0, y: 0, z: 0 };
    const s = solveRope("left", geom, 1000, true, ORIGIN, IDENTITY, com);
    expect(s.direction.y).toBeCloseTo(1, 12);
    expect(s.torqueAboutCom.x).toBeCloseTo(-2000, 9);
    expect(s.torqueAboutCom.y).toBeCloseTo(0, 12);
    expect(s.torqueAboutCom.z).toBeCloseTo(0, 12);
  });

  it("produces zero torque when the rope pulls straight through the COM", () => {
    const geom: RopeGeometry = {
      externalAnchor: { x: 0, y: 10, z: 1 },
      attachmentLocal: { x: 0, y: 0, z: 1 }
    };
    const s = solveRope("left", geom, 1000, true, ORIGIN, IDENTITY, { x: 0, y: 0, z: 1 });
    expect(length(s.torqueAboutCom)).toBeCloseTo(0, 9);
  });

  it("tracks the attachment through the body's rotation", () => {
    // 90 deg about z maps local +x onto world +y.
    const quat = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const geom: RopeGeometry = { externalAnchor: { x: 0, y: 0, z: 0 }, attachmentLocal: { x: 1, y: 0, z: 0 } };
    const s = solveRope("left", geom, 10, true, ORIGIN, quat, ORIGIN);
    expect(s.attachmentWorld.x).toBeCloseTo(0, 9);
    expect(s.attachmentWorld.y).toBeCloseTo(1, 9);
  });

  it("degrades to zero force rather than NaN when the rope has zero length", () => {
    const geom: RopeGeometry = { externalAnchor: { x: 1, y: 2, z: 3 }, attachmentLocal: { x: 1, y: 2, z: 3 } };
    const s = solveRope("left", geom, 1000, true, ORIGIN, IDENTITY, ORIGIN);
    expect(Number.isFinite(s.force.x)).toBe(true);
    expect(length(s.force)).toBe(0);
    expect(length(s.direction)).toBe(0);
  });
});

describe("mirrorRopeGeometry", () => {
  it("flips y on both endpoints and leaves x and z alone", () => {
    const m = mirrorRopeGeometry({
      externalAnchor: { x: 1.5, y: 3, z: 1.2 },
      attachmentLocal: { x: 0.1, y: 0.56, z: 2.45 }
    });
    expect(m.externalAnchor).toEqual({ x: 1.5, y: -3, z: 1.2 });
    expect(m.attachmentLocal).toEqual({ x: 0.1, y: -0.56, z: 2.45 });
  });

  it("is its own inverse", () => {
    const original: RopeGeometry = {
      externalAnchor: { x: 1.5, y: 3, z: 1.2 },
      attachmentLocal: { x: 0, y: 0.56, z: 2.45 }
    };
    expect(mirrorRopeGeometry(mirrorRopeGeometry(original))).toEqual(original);
  });
});
