import type { Vec2 } from "./polytope";

/**
 * Ground-plane footprint construction for the flat-bottomed base families.
 *
 * Every footprint here is built the same way: scatter points that describe the
 * intended outline, then take their 2D convex hull. Expressing shapes as point
 * clouds rather than as hand-wound polygons means no family can accidentally
 * emit a self-intersecting or concave outline — the hull step makes convexity a
 * property of the construction rather than of the author's care. That matters
 * twice over: the prism triangulation in `polytope.ts` fans from a single
 * vertex and is only valid for convex outlines, and Rapier's `convexHull`
 * collider would silently take the hull anyway, so a concave design point would
 * produce a collider that differed from the drawn mesh.
 *
 * Coordinates are body-local: x forward, y lateral (+ is left).
 */

/**
 * Smallest edge any footprint is allowed to carry, in meters.
 *
 * Sampling a shape's outline parametrically produces points that are
 * mathematically distinct but numerically identical — the tip of an ellipse
 * sampled at t = pi/2 lands at y = +/-6e-17 rather than 0, giving two "vertices"
 * a tenth of an attometre apart. Extruding that yields a face with no
 * well-defined normal, and the contact solver resting on it behaves erratically:
 * a D-base under a steady sub-threshold pull wandered 17 mm backwards, then 30 mm
 * forwards, and climbed 12 mm, none of which is physics.
 *
 * A nanometre is fifteen orders of magnitude below anything this simulation
 * models and eight below the tightest tolerance it asserts, so collapsing points
 * closer than this can only remove numerical noise.
 */
export const MIN_FOOTPRINT_EDGE_M = 1e-9;

/** Andrew's monotone chain. Returns a counter-clockwise convex polygon with
 * no repeated, collinear, or numerically-coincident points. */
export function convexHull2D(points: readonly Vec2[]): Vec2[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (source: readonly Vec2[]): Vec2[] => {
    const chain: Vec2[] = [];
    for (const p of source) {
      while (chain.length >= 2 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  const hull = [...build(sorted), ...build([...sorted].reverse())];

  // Drop vertices closer together than the minimum edge, including across the
  // closing edge, so no degenerate face can reach the collider.
  const cleaned: Vec2[] = [];
  for (const p of hull) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) < MIN_FOOTPRINT_EDGE_M) continue;
    cleaned.push(p);
  }
  while (
    cleaned.length > 2 &&
    Math.hypot(
      cleaned[0]!.x - cleaned[cleaned.length - 1]!.x,
      cleaned[0]!.y - cleaned[cleaned.length - 1]!.y
    ) < MIN_FOOTPRINT_EDGE_M
  ) {
    cleaned.pop();
  }
  return cleaned;
}

/** Signed area, positive for the counter-clockwise winding `convexHull2D` emits. */
export function footprintArea(footprint: readonly Vec2[]): number {
  let twiceArea = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % footprint.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

export function footprintBounds(footprint: readonly Vec2[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** True when every turn around the outline is in the same direction. Used by
 * the unit tests to guard each family's generator, not by the runtime path. */
export function footprintIsConvex(footprint: readonly Vec2[]): boolean {
  if (footprint.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % footprint.length]!;
    const c = footprint[(i + 2) % footprint.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-12) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Left/right asymmetry: the +y half-width becomes `(W/2)(1 + a)` and the -y
 * half-width `(W/2)(1 - a)`.
 *
 * Total lateral width is preserved exactly, by construction — the shape leans
 * off its centerline without getting wider. That is deliberate: `W_base/H` has
 * to keep meaning "maximum lateral base width" for any later matched
 * comparison to be worth anything, so a symmetry-breaking control must not
 * smuggle in extra footprint.
 */
export function applyLateralAsymmetry(footprint: readonly Vec2[], asymmetry: number): Vec2[] {
  if (asymmetry === 0) return footprint.map((p) => ({ ...p }));
  return convexHull2D(
    footprint.map((p) => ({ x: p.x, y: p.y >= 0 ? p.y * (1 + asymmetry) : p.y * (1 - asymmetry) }))
  );
}

/** Area centroid of a convex outline. */
export function footprintCentroid(footprint: readonly Vec2[]): Vec2 {
  const area = footprintArea(footprint);
  if (Math.abs(area) < 1e-15) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % footprint.length]!;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * Splits a convex outline into `count` pie-slice wedges about its centroid, as
 * contiguous runs of boundary vertices fanned from the centre. The wedges share
 * edges, overlap nowhere, and their union is exactly the original outline.
 *
 * This exists for a specific and entirely non-cosmetic reason. Rapier keeps at
 * most four solver contacts per collider pair, and its point-selection for a
 * convex polyhedron resting face-down on the road can collapse the contact
 * patch: measured on the D-base, a 0.43 m wide patch shrank to 39 mm over three
 * seconds, at which point the statue was balancing on a stamp, injecting energy
 * and climbing ~14 mm with nothing pulling it. A0's cuboid never showed this
 * because box-vs-box has its own specialised, robust contact path.
 *
 * Handing the same solid to the solver as several smaller colliders gives one
 * manifold per wedge instead of one for the whole base, so the contact points
 * stay spread around the real footprint. Nothing about the geometry changes —
 * same outline, same volume, same mass, same centre of mass, verified by test.
 * This is a contact-discretisation fix, not a physical one.
 */
export function wedgeDecomposition(footprint: readonly Vec2[], count: number): Vec2[][] {
  const n = footprint.length;
  if (count < 3 || n < 2 * count) return [footprint.map((p) => ({ ...p }))];

  const centre = footprintCentroid(footprint);
  const wedges: Vec2[][] = [];
  for (let w = 0; w < count; w++) {
    const start = Math.round((n * w) / count);
    const end = Math.round((n * (w + 1)) / count);
    const chain: Vec2[] = [centre];
    for (let i = start; i <= end; i++) chain.push(footprint[i % n]!);
    wedges.push(convexHull2D(chain));
  }
  return wedges;
}

export function rectangleFootprint(lengthX: number, widthY: number): Vec2[] {
  const hx = lengthX / 2;
  const hy = widthY / 2;
  return convexHull2D([
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy }
  ]);
}

export function ellipseFootprint(lengthX: number, widthY: number, segments: number): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    points.push({ x: (lengthX / 2) * Math.cos(t), y: (widthY / 2) * Math.sin(t) });
  }
  return convexHull2D(points);
}

/**
 * Rectangle with rounded fore and aft caps: straight full-width sides over the
 * central span, capped at each end.
 *
 * The caps are semicircular when the base is at least as long as it is wide,
 * and flatten into semi-ellipses when it is not. Insisting on circular caps
 * would make the stadium impossible to build any shorter than `widthY` — it
 * would silently become a circle and quietly break the guarantee that
 * `L_base/H` means the fore-aft length. Flattening the caps keeps both stated
 * dimensions exactly.
 */
export function stadiumFootprint(lengthX: number, widthY: number, capSegments: number): Vec2[] {
  const halfWidth = widthY / 2;
  const capSemiX = Math.min(halfWidth, lengthX / 2);
  const straightHalf = lengthX / 2 - capSemiX;
  return ellipseHullFootprint(
    [
      { x: straightHalf, y: 0, semiX: capSemiX, semiY: halfWidth },
      { x: -straightHalf, y: 0, semiX: capSemiX, semiY: halfWidth }
    ],
    capSegments
  );
}

/**
 * The convex hull of a set of sampled ellipses. This is how the stadium, the
 * teardrops and the rounded rectangle are all expressed: as a few ellipses
 * whose hull is the outline, with the connecting tangent lines falling out of
 * the hull step rather than being solved for.
 */
export function ellipseHullFootprint(
  parts: readonly { x: number; y: number; semiX: number; semiY: number }[],
  segmentsPerPart: number
): Vec2[] {
  const points: Vec2[] = [];
  for (const part of parts) {
    if (part.semiX <= 0 || part.semiY <= 0) {
      points.push({ x: part.x, y: part.y });
      continue;
    }
    for (let i = 0; i < segmentsPerPart; i++) {
      const t = (2 * Math.PI * i) / segmentsPerPart;
      points.push({
        x: part.x + part.semiX * Math.cos(t),
        y: part.y + part.semiY * Math.sin(t)
      });
    }
  }
  return convexHull2D(points);
}

/** The circular special case of `ellipseHullFootprint`. */
export function circleHullFootprint(
  discs: readonly { x: number; y: number; radius: number }[],
  segmentsPerCircle: number
): Vec2[] {
  return ellipseHullFootprint(
    discs.map((d) => ({ x: d.x, y: d.y, semiX: d.radius, semiY: d.radius })),
    segmentsPerCircle
  );
}

/** Rectangle with rounded corners, as the hull of four corner discs. */
export function roundedRectangleFootprint(
  lengthX: number,
  widthY: number,
  cornerRadius: number,
  segmentsPerCorner: number
): Vec2[] {
  const r = Math.max(0, Math.min(cornerRadius, lengthX / 2, widthY / 2));
  if (r === 0) return rectangleFootprint(lengthX, widthY);
  const hx = lengthX / 2 - r;
  const hy = widthY / 2 - r;
  return circleHullFootprint(
    [
      { x: hx, y: hy, radius: r },
      { x: hx, y: -hy, radius: r },
      { x: -hx, y: hy, radius: r },
      { x: -hx, y: -hy, radius: r }
    ],
    segmentsPerCorner * 4
  );
}

/**
 * D-shape: a rounded front and a flat transom at the rear, the widest point
 * sitting at x = 0.
 *
 * `frontBackAsymmetry` splits the total length: the rounded front runs
 * `(L/2)(1 + f)` forward and the straight-sided rear `(L/2)(1 - f)` aft, so
 * total fore-aft length stays exactly `L` however the shape is skewed — the
 * same invariant `applyLateralAsymmetry` maintains laterally.
 */
export function dShapeFootprint(
  lengthX: number,
  widthY: number,
  frontBackAsymmetry: number,
  segments: number
): Vec2[] {
  const frontLength = (lengthX / 2) * (1 + frontBackAsymmetry);
  const rearLength = (lengthX / 2) * (1 - frontBackAsymmetry);
  const hy = widthY / 2;

  const points: Vec2[] = [
    { x: -rearLength, y: -hy },
    { x: -rearLength, y: hy },
    { x: 0, y: -hy },
    { x: 0, y: hy }
  ];
  // Quarter-ellipse nose, from the widest point forward to the tip.
  for (let i = 1; i <= segments; i++) {
    const t = (Math.PI / 2) * (i / segments);
    points.push({ x: frontLength * Math.sin(t), y: hy * Math.cos(t) });
    points.push({ x: frontLength * Math.sin(t), y: -hy * Math.cos(t) });
  }
  return convexHull2D(points);
}

/**
 * Teardrop: a broad rounded front tapering to a narrower rounded tail, built as
 * the convex hull of a front ellipse and a smaller rear disc.
 *
 * The nose is an *ellipse* rather than a circle for a reason worth stating: a
 * circular nose of radius W/2 would itself be W long, so a teardrop whose base
 * is wider than it is long — which the default statue's is — could not be built
 * at all. Decoupling the nose's fore-aft semi-axis from its lateral one removes
 * that false constraint without changing the shape's character.
 *
 * Total length is exactly `lengthX` and maximum width exactly `widthY` for any
 * tail radius, so the taper changes shape rather than size. `tailRadius` is this
 * family's reading of the shared fore-aft curvature radius `R_fore/H`.
 */
export function teardropFootprint(
  lengthX: number,
  widthY: number,
  tailRadius: number,
  frontBackAsymmetry: number,
  segmentsPerPart: number
): Vec2[] {
  const halfWidth = widthY / 2;
  const tail = Math.max(1e-4, Math.min(tailRadius, halfWidth));

  // The widest point sits at x = 0; the asymmetry splits the total length
  // between the nose ahead of it and the tail behind it.
  const noseLength = (lengthX / 2) * (1 + frontBackAsymmetry);
  const tailLength = (lengthX / 2) * (1 - frontBackAsymmetry);
  if (noseLength <= 0 || tailLength <= 0) {
    throw new Error(
      `Teardrop: front/back asymmetry ${frontBackAsymmetry} leaves a non-positive nose or tail length. ` +
        "Keep |f_fb| below 1."
    );
  }

  // Only the *forward* half of the nose ellipse is sampled. Sampling the whole
  // ellipse would put material behind the widest point that swallows the tail
  // disc entirely, and the hull would come back as a plain ellipse — a silent
  // collapse of B2 into A2 that looks like a working teardrop until measured.
  const points: Vec2[] = [
    { x: 0, y: halfWidth },
    { x: 0, y: -halfWidth }
  ];
  for (let i = 1; i <= segmentsPerPart; i++) {
    const t = (Math.PI / 2) * (i / segmentsPerPart);
    points.push({ x: noseLength * Math.sin(t), y: halfWidth * Math.cos(t) });
    points.push({ x: noseLength * Math.sin(t), y: -halfWidth * Math.cos(t) });
  }
  // Rear extreme lands at exactly -tailLength whatever the tail radius, since
  // the disc centre is placed one radius ahead of it.
  const tailCenterX = -(tailLength - tail);
  for (let i = 0; i < segmentsPerPart; i++) {
    const t = (2 * Math.PI * i) / segmentsPerPart;
    points.push({ x: tailCenterX + tail * Math.cos(t), y: tail * Math.sin(t) });
  }
  return convexHull2D(points);
}
