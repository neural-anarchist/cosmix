import * as THREE from "three";
import type { Vec3 } from "../../core/vec3";

/**
 * A closed, triangulated convex polytope in body-local space.
 *
 * This is the single geometric object a curved base family produces. Both the
 * collider and the display mesh are built from it, so for these families the
 * simulated shape and the drawn shape are not merely consistent — they are the
 * same set of triangles. The approximation is therefore honest and singular:
 * a smooth ideal surface is represented by a polytope with a stated facet
 * count, and nothing else differs between what you see and what you simulate.
 *
 * A0 and A4 deliberately do NOT use this path: they keep the exact analytic
 * cuboid and cylinder colliders they were validated with in Phase 1, where the
 * primitive *is* the ideal shape and faceting would be a regression.
 */
export interface Polytope {
  /** Triangle corners, body-local meters. */
  vertices: Vec3[];
  /** Triangle indices into `vertices`, wound counter-clockwise seen from
   * outside so the signed volume below comes out positive. */
  indices: number[];
}

/** A point on a footprint in the ground plane: x forward, y lateral. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Exact volume of the polytope, by the divergence theorem: the signed volume
 * of the tetrahedron spanned by the origin and each triangle, summed.
 *
 * This is the volume of the shape that is actually simulated, not of the
 * smooth ideal it approximates — which is the whole point. Densities are
 * derived from it, so a family's base mass comes out at exactly
 * `baseMassFraction x M` no matter how coarsely its surface is tessellated.
 * A unit test cross-checks it against Rapier's own `collider.volume()`.
 */
export function polytopeVolume(polytope: Polytope): number {
  const { vertices, indices } = polytope;
  let sixVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]]!;
    const b = vertices[indices[i + 1]]!;
    const c = vertices[indices[i + 2]]!;
    sixVolume +=
      a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x);
  }
  return sixVolume / 6;
}

/**
 * Exact centroid of the polytope, by the same tetrahedral decomposition as
 * `polytopeVolume`: each triangle spans a tetrahedron with the origin, whose
 * own centroid is the mean of its four corners, weighted by its signed volume.
 *
 * Needed because the base's centre of mass cannot be assumed to sit at half its
 * height once the family stops being a prism. A half-ellipsoid's centroid sits
 * at five-eighths of its height, and a wedge-topped base's sits off the
 * centreline entirely — assuming otherwise would put the whole statue's COM in
 * the wrong place while every individual number still looked plausible.
 */
export function polytopeCentroid(polytope: Polytope): Vec3 {
  const { vertices, indices } = polytope;
  let volume = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]]!;
    const b = vertices[indices[i + 1]]!;
    const c = vertices[indices[i + 2]]!;
    const v =
      (a.x * (b.y * c.z - b.z * c.y) -
        a.y * (b.x * c.z - b.z * c.x) +
        a.z * (b.x * c.y - b.y * c.x)) /
      6;
    volume += v;
    cx += (v * (a.x + b.x + c.x)) / 4;
    cy += (v * (a.y + b.y + c.y)) / 4;
    cz += (v * (a.z + b.z + c.z)) / 4;
  }
  if (volume === 0) return { x: 0, y: 0, z: 0 };
  return { x: cx / volume, y: cy / volume, z: cz / volume };
}

/** Axis-aligned extents of a polytope, body-local. */
export function polytopeBounds(polytope: Polytope): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of polytope.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Reflects a polytope through the y-z plane (x -> -x), the fore-aft mirror.
 *
 * Triangle winding is reversed as well as the coordinate negated. A reflection
 * inverts orientation, so mirroring the vertices alone would turn every face
 * inside out — the volume would come out negative and the display mesh would
 * be lit from within. This is the operation that makes B3 an exact mirror of
 * B2 by construction rather than by two hand-written shape definitions that
 * merely look like mirrors.
 */
export function mirrorPolytopeForeAft(polytope: Polytope): Polytope {
  const vertices = polytope.vertices.map((v) => ({ x: -v.x, y: v.y, z: v.z }));
  const indices: number[] = [];
  for (let i = 0; i < polytope.indices.length; i += 3) {
    indices.push(polytope.indices[i]!, polytope.indices[i + 2]!, polytope.indices[i + 1]!);
  }
  return { vertices, indices };
}

/** Shifts a polytope along x, for base families offset relative to the upper body. */
export function translatePolytopeX(polytope: Polytope, offsetX: number): Polytope {
  if (offsetX === 0) return polytope;
  return {
    vertices: polytope.vertices.map((v) => ({ x: v.x + offsetX, y: v.y, z: v.z })),
    indices: [...polytope.indices]
  };
}

/**
 * Builds a prism from a convex footprint polygon: a flat bottom at z = 0 and a
 * top surface whose height may vary with position, which is how a base with an
 * angled mounting plane (B6) is expressed without disturbing its ground contact.
 *
 * The footprint must be convex and wound counter-clockwise in the x-y plane;
 * both caps are fan-triangulated from vertex 0, which is only valid for a
 * convex polygon. `footprintIsConvex` guards this and every family that uses
 * this path is unit-tested against it.
 */
export function extrudeFootprint(
  footprint: readonly Vec2[],
  topZAt: (point: Vec2) => number
): Polytope {
  const n = footprint.length;
  if (n < 3) throw new Error(`A footprint needs at least 3 points; got ${n}.`);

  const vertices: Vec3[] = [];
  for (const p of footprint) vertices.push({ x: p.x, y: p.y, z: 0 });
  for (const p of footprint) vertices.push({ x: p.x, y: p.y, z: topZAt(p) });

  const indices: number[] = [];
  // Bottom cap, wound clockwise seen from above so its outward normal is -z.
  for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i);
  // Top cap, wound counter-clockwise seen from above: outward normal +z.
  for (let i = 1; i < n - 1; i++) indices.push(n, n + i, n + i + 1);
  // Sides.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j);
    indices.push(i, n + j, n + i);
  }
  return { vertices, indices };
}

/**
 * One cross-section of a rocker: an elliptical arc in the y-z plane, hanging
 * below `centerZ`, so the surface touches the ground at `centerZ - semiZ`.
 * A constant-radius circular station gives a cylindrical rocker; letting the
 * semi-axes shrink toward the ends gives an ellipsoidal one; letting `centerZ`
 * rise toward the ends gives a fore-aft rocker.
 */
export interface RockerStation {
  x: number;
  /** Lateral semi-axis of this station's arc. */
  semiY: number;
  /** Vertical semi-axis of this station's arc. */
  semiZ: number;
  /** Height of the arc's centre above the ground plane. */
  centerZ: number;
}

/**
 * Builds a rocker by lofting elliptical arcs along x and closing the top with
 * a flat lid.
 *
 * The result is convex whenever the station profile is, which every family
 * using it satisfies: a solid bounded below by a convex surface and above by a
 * plane is convex. That matters because the collider is Rapier's convex hull of
 * these vertices — if the design were concave, the simulated shape would
 * quietly become its hull and stop matching the drawn mesh.
 *
 * This is a genuine approximation and the one place it is worth being blunt
 * about: a rocker built here rolls on facets, not on a smooth curve. A4 is
 * deliberately left as an exact analytic cylinder for that reason, and stands
 * as the reference against which the faceted families can be checked.
 */
export function loftRocker(options: {
  /** Stations along x, ascending. */
  stations: readonly RockerStation[];
  /** Facets across each arc. Higher means smaller steps as the base rolls. */
  arcSegments: number;
}): Polytope {
  const { stations, arcSegments } = options;
  if (stations.length < 2) throw new Error("A rocker loft needs at least 2 stations along x.");
  if (arcSegments < 3) throw new Error("A rocker loft needs at least 3 arc segments.");

  const ringSize = arcSegments + 1;
  const vertices: Vec3[] = [];
  const indices: number[] = [];

  // Rolling surface. Angle 0 is straight down (the contact point); the arc
  // sweeps a full half-turn so its rim lands exactly on the lid plane.
  for (const station of stations) {
    for (let s = 0; s <= arcSegments; s++) {
      const theta = -Math.PI / 2 + (Math.PI * s) / arcSegments;
      vertices.push({
        x: station.x,
        y: station.semiY * Math.sin(theta),
        z: station.centerZ - station.semiZ * Math.cos(theta)
      });
    }
  }

  const lidZ = Math.max(...stations.map((s) => s.centerZ));
  const lidStart = vertices.length;
  for (const station of stations) {
    vertices.push({ x: station.x, y: -station.semiY, z: lidZ });
    vertices.push({ x: station.x, y: station.semiY, z: lidZ });
  }

  const arcAt = (i: number, s: number) => i * ringSize + s;
  const lidAt = (i: number, side: 0 | 1) => lidStart + i * 2 + side;

  for (let i = 0; i < stations.length - 1; i++) {
    for (let s = 0; s < arcSegments; s++) {
      indices.push(arcAt(i, s), arcAt(i, s + 1), arcAt(i + 1, s + 1));
      indices.push(arcAt(i, s), arcAt(i + 1, s + 1), arcAt(i + 1, s));
    }
    // Lid, outward normal +z.
    indices.push(lidAt(i, 0), lidAt(i + 1, 1), lidAt(i, 1));
    indices.push(lidAt(i, 0), lidAt(i + 1, 0), lidAt(i + 1, 1));

    // Vertical skirt from each arc rim up to the lid. Zero-height wherever the
    // station's centre already sits at the lid plane, so it is skipped there
    // rather than emitting degenerate triangles.
    const a = stations[i]!;
    const b = stations[i + 1]!;
    if (a.centerZ < lidZ || b.centerZ < lidZ) {
      indices.push(arcAt(i, 0), lidAt(i + 1, 0), lidAt(i, 0));
      indices.push(arcAt(i, 0), arcAt(i + 1, 0), lidAt(i + 1, 0));
      indices.push(arcAt(i, arcSegments), lidAt(i, 1), lidAt(i + 1, 1));
      indices.push(arcAt(i, arcSegments), lidAt(i + 1, 1), arcAt(i + 1, arcSegments));
    }
  }

  // End caps, fanned from each end arc's first rim vertex. The two ends are
  // wound oppositely: the start cap faces -x and the end cap faces +x.
  const last = stations.length - 1;
  for (let s = 1; s < arcSegments; s++) {
    indices.push(arcAt(0, 0), arcAt(0, s + 1), arcAt(0, s));
  }
  indices.push(arcAt(0, 0), lidAt(0, 1), arcAt(0, arcSegments));
  // Zero-area whenever the end arc's rim already sits on the lid plane, which
  // is the normal case for a constant-height rocker.
  if (stations[0]!.centerZ < lidZ) indices.push(arcAt(0, 0), lidAt(0, 0), lidAt(0, 1));
  for (let s = 1; s < arcSegments; s++) {
    indices.push(arcAt(last, 0), arcAt(last, s), arcAt(last, s + 1));
  }
  indices.push(arcAt(last, 0), arcAt(last, arcSegments), lidAt(last, 1));
  if (stations[last]!.centerZ < lidZ) indices.push(arcAt(last, 0), lidAt(last, 1), lidAt(last, 0));

  return { vertices, indices };
}

/** Flat-shaded display geometry built from the polytope's own triangles, so
 * the drawn base is exactly the simulated one. Non-indexed on purpose:
 * unshared vertices give per-facet normals, which is what makes the facet
 * count of a curved family visible rather than smoothed away. */
export function polytopeToGeometry(polytope: Polytope): THREE.BufferGeometry {
  const positions = new Float32Array(polytope.indices.length * 3);
  for (let i = 0; i < polytope.indices.length; i++) {
    const v = polytope.vertices[polytope.indices[i]!]!;
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat point array in the layout Rapier's `convexHull` expects. */
export function polytopePoints(polytope: Polytope): Float32Array {
  const points = new Float32Array(polytope.vertices.length * 3);
  polytope.vertices.forEach((v, i) => {
    points[i * 3] = v.x;
    points[i * 3 + 1] = v.y;
    points[i * 3 + 2] = v.z;
  });
  return points;
}
