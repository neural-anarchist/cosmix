import { describe, expect, it } from "vitest";
import {
  extrudeFootprint,
  loftRocker,
  mirrorPolytopeForeAft,
  polytopeBounds,
  polytopeCentroid,
  polytopeVolume,
  translatePolytopeX,
  type Polytope,
  type RockerStation
} from "./polytope";

/** Unit cube spanning [0,1]^3, wound outward. Built by the same extrusion the
 * families use, so a winding regression shows up here first. */
const unitCube = (): Polytope =>
  extrudeFootprint(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ],
    () => 1
  );

/** Every face's outward normal must point away from the interior. A polytope
 * with a single inverted face still closes, and still produces a plausible
 * volume — it is exactly the kind of error that hides. */
function inwardFacingCount(polytope: Polytope): number {
  const n = polytope.vertices.length;
  const centre = polytope.vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x / n, y: acc.y + v.y / n, z: acc.z + v.z / n }),
    { x: 0, y: 0, z: 0 }
  );
  let inward = 0;
  for (let i = 0; i < polytope.indices.length; i += 3) {
    const a = polytope.vertices[polytope.indices[i]!]!;
    const b = polytope.vertices[polytope.indices[i + 1]!]!;
    const c = polytope.vertices[polytope.indices[i + 2]!]!;
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const nx = u.y * v.z - u.z * v.y;
    const ny = u.z * v.x - u.x * v.z;
    const nz = u.x * v.y - u.y * v.x;
    if (Math.hypot(nx, ny, nz) < 1e-12) continue;
    const rx = (a.x + b.x + c.x) / 3 - centre.x;
    const ry = (a.y + b.y + c.y) / 3 - centre.y;
    const rz = (a.z + b.z + c.z) / 3 - centre.z;
    if (nx * rx + ny * ry + nz * rz < 0) inward++;
  }
  return inward;
}

describe("polytope volume and centroid", () => {
  it("gives the exact volume and centroid of a unit cube", () => {
    const cube = unitCube();
    expect(polytopeVolume(cube)).toBeCloseTo(1, 12);
    const c = polytopeCentroid(cube);
    expect(c.x).toBeCloseTo(0.5, 12);
    expect(c.y).toBeCloseTo(0.5, 12);
    expect(c.z).toBeCloseTo(0.5, 12);
  });

  it("winds every extruded face outward", () => {
    expect(inwardFacingCount(unitCube())).toBe(0);
  });

  it("winds every lofted rocker face outward, with and without a skirt", () => {
    const flat: RockerStation[] = [-0.4, 0, 0.4].map((x) => ({ x, semiY: 0.5, semiZ: 0.5, centerZ: 0.5 }));
    const rising: RockerStation[] = [
      { x: -0.4, semiY: 0.5, semiZ: 0.5, centerZ: 0.62 },
      { x: 0, semiY: 0.5, semiZ: 0.5, centerZ: 0.5 },
      { x: 0.4, semiY: 0.5, semiZ: 0.5, centerZ: 0.7 }
    ];
    expect(inwardFacingCount(loftRocker({ stations: flat, arcSegments: 12 }))).toBe(0);
    expect(inwardFacingCount(loftRocker({ stations: rising, arcSegments: 12 }))).toBe(0);
    expect(polytopeVolume(loftRocker({ stations: flat, arcSegments: 12 }))).toBeGreaterThan(0);
    expect(polytopeVolume(loftRocker({ stations: rising, arcSegments: 12 }))).toBeGreaterThan(0);
  });

  it("converges on the analytic half-cylinder volume as the arc is refined", () => {
    const exact = (Math.PI * 0.5 ** 2 * 0.8) / 2;
    const volumeAt = (segments: number) =>
      polytopeVolume(
        loftRocker({
          stations: [-0.4, 0.4].map((x) => ({ x, semiY: 0.5, semiZ: 0.5, centerZ: 0.5 })),
          arcSegments: segments
        })
      );
    const coarse = Math.abs(volumeAt(8) - exact);
    const fine = Math.abs(volumeAt(64) - exact);
    // Inscribed, so always short of the true volume, and monotonically closer.
    expect(volumeAt(8)).toBeLessThan(exact);
    expect(fine).toBeLessThan(coarse / 10);
    expect(fine / exact).toBeLessThan(0.002);
  });

  it("puts a half-ellipsoid's centroid above its mid-height, not at it", () => {
    // A hemisphere's centroid sits 3/8 R from its flat face — 5/8 of the way up
    // from the pole. Assuming half-height here would misplace the whole
    // statue's COM, which is why BaseDims carries a real centroid.
    const R = 0.5;
    const stations: RockerStation[] = [];
    const n = 129;
    for (let i = 0; i < n; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / (n - 1);
      const s = Math.cos(t);
      stations.push({ x: R * Math.sin(t), semiY: R * s, semiZ: R * s, centerZ: R });
    }
    const centroid = polytopeCentroid(loftRocker({ stations, arcSegments: 128 }));
    expect(centroid.z).toBeCloseTo((5 * R) / 8, 2);
    expect(centroid.z).toBeGreaterThan(R / 2);
  });
});

describe("fore-aft mirroring", () => {
  const wedge = (): Polytope =>
    extrudeFootprint(
      [
        { x: -0.3, y: -0.2 },
        { x: 0.5, y: 0 },
        { x: -0.3, y: 0.2 }
      ],
      () => 0.4
    );

  it("negates x and keeps the volume positive by reversing the winding", () => {
    const original = wedge();
    const mirrored = mirrorPolytopeForeAft(original);
    expect(polytopeVolume(mirrored)).toBeCloseTo(polytopeVolume(original), 12);
    expect(polytopeVolume(mirrored)).toBeGreaterThan(0);
    expect(inwardFacingCount(mirrored)).toBe(0);
  });

  it("reflects the centroid and the bounds exactly", () => {
    const original = wedge();
    const mirrored = mirrorPolytopeForeAft(original);
    expect(polytopeCentroid(mirrored).x).toBeCloseTo(-polytopeCentroid(original).x, 12);
    expect(polytopeBounds(mirrored).minX).toBeCloseTo(-polytopeBounds(original).maxX, 12);
    expect(polytopeBounds(mirrored).maxX).toBeCloseTo(-polytopeBounds(original).minX, 12);
  });

  it("is its own inverse", () => {
    const original = wedge();
    const round = mirrorPolytopeForeAft(mirrorPolytopeForeAft(original));
    original.vertices.forEach((v, i) => {
      expect(round.vertices[i]!.x).toBeCloseTo(v.x, 12);
      expect(round.vertices[i]!.y).toBeCloseTo(v.y, 12);
      expect(round.vertices[i]!.z).toBeCloseTo(v.z, 12);
    });
    expect(round.indices).toEqual(original.indices);
  });

  it("translating along x moves the centroid and nothing else", () => {
    const original = wedge();
    const shifted = translatePolytopeX(original, 0.25);
    expect(polytopeVolume(shifted)).toBeCloseTo(polytopeVolume(original), 12);
    expect(polytopeCentroid(shifted).x).toBeCloseTo(polytopeCentroid(original).x + 0.25, 12);
    expect(polytopeCentroid(shifted).z).toBeCloseTo(polytopeCentroid(original).z, 12);
  });
});

describe("extrusion guards", () => {
  it("rejects a footprint with fewer than three points", () => {
    expect(() => extrudeFootprint([{ x: 0, y: 0 }, { x: 1, y: 0 }], () => 1)).toThrow(/at least 3/);
  });

  it("rejects a rocker loft with too few stations or arc segments", () => {
    const s: RockerStation = { x: 0, semiY: 1, semiZ: 1, centerZ: 1 };
    expect(() => loftRocker({ stations: [s], arcSegments: 8 })).toThrow(/at least 2 stations/);
    expect(() => loftRocker({ stations: [s, { ...s, x: 1 }], arcSegments: 2 })).toThrow(/at least 3 arc/);
  });

  it("builds a variable-height top face, for a base whose mount plane is cut at an angle", () => {
    const wedge = extrudeFootprint(
      [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 }
      ],
      (p) => 1 - p.x * 0.5
    );
    // Mean height 1 over a unit footprint, and the centroid pushed toward the
    // taller (rear) end.
    expect(polytopeVolume(wedge)).toBeCloseTo(1, 10);
    expect(polytopeCentroid(wedge).x).toBeLessThan(0);
    expect(inwardFacingCount(wedge)).toBe(0);
  });
});
