/* ============================================================================
   BOTTLE LENS LABORATORY
   IYPT 2015 problem 12 — "Thick Lens"

   A liquid-filled bottle is a thick optical element with four refracting
   interfaces. This file traces real rays through it with the vector form of
   Snell's law, converts the resulting ray density into an approximate
   irradiance, and drives a deliberately simple lumped thermal model of a
   small target.

   ----------------------------------------------------------------------------
   SCOPE OF THE MODEL — read this before trusting any number
   ----------------------------------------------------------------------------
   * Everything is traced in a single two-dimensional MERIDIONAL SECTION: the
     plane that contains the bottle's axis and the incoming beam. Skew rays,
     which leave that plane, are not traced at all. For a body of revolution
     illuminated on-axis the meridional section carries the whole story; for
     anything tilted it does not, and the code says so in the sanity checks.

   * The third dimension is supplied by an explicit choice (see MODE below),
     not by an assumption buried in the code. Revolving the section and
     extruding it give radically different concentrations — a factor of ~25 for
     realistic geometry — and that difference is the physical heart of this
     problem. BOTH are idealized radiometric conversions of the same 2D trace,
     not measurements: revolved mode assumes a perfect body of revolution
     illuminated exactly on-axis, extruded mode assumes a perfectly straight
     cylinder illuminated exactly broadside. A real tilted or off-axis bottle
     sits somewhere between the two, so they are best read as the pair of
     idealized bounds a real bottle's concentration falls between, not as a
     prediction for one specific setup.

   * Geometric optics only. No diffraction, no interference, no scattering.
     Irradiance is estimated by binning weighted rays, which is an
     approximation that becomes formally invalid exactly at a caustic, where
     the geometric-optics irradiance diverges.

   * The thermal model is one node with one time constant. It reports a
     temperature. It does not, and cannot, predict ignition.

   Units: all geometry is in MILLIMETRES (comfortable slider numbers).
   Radiometry converts to metres at the point of use, and every such
   conversion is marked. Angles are radians internally, degrees in the UI.
   ============================================================================ */

'use strict';

/* ============================================================================
   0 · CONSTANTS AND DEFAULTS
   ========================================================================== */

const MODE = {
  /** Extrude the traced profile out of the page: a cylindrical lens, line focus. */
  CYLINDRICAL: 'cylindrical',
  /** Revolve the traced profile about the axis: a body of revolution, point focus. */
  REVOLVED: 'revolved'
};

/** Stefan–Boltzmann constant, W m^-2 K^-4. */
const SIGMA = 5.670374419e-8;

/** Kelvin offset. */
const T0_K = 273.15;

/**
 * Angular diameter of the Sun as seen from Earth, in radians (~0.53°).
 * The tracer launches a mathematically parallel beam, but the real Sun is an
 * extended source: every point of the focal plane receives an image of the
 * solar disc of width f·Θ. That sets a hard floor on the achievable spot size,
 * and therefore on the concentration. Ignoring it is the single easiest way to
 * produce a spectacular but meaningless concentration factor, so the floor is
 * applied explicitly and reported in the UI.
 */
const SUN_ANGULAR_DIAMETER = 0.00930;

/** Detector cell used for ray-density binning, mm. A stand-in for the finite
 *  resolution of any real target (conduction smears anything finer anyway). */
const PROFILE_BIN_MM = 0.5;

/** Hard ceiling on refraction/reflection events per ray. A ray trapped by
 *  total internal reflection would otherwise bounce forever. */
const MAX_SEGMENTS = 18;

/** Distance to step off a surface before searching for the next one, mm.
 *  Coordinates are O(100 mm) and doubles carry ~1e-13 mm of noise there, so
 *  1e-6 mm is seven orders of magnitude above the numerical grass and seven
 *  below any physical feature. */
const T_EPS = 1e-6;

/** Distance either side of an interface used to sample which media meet
 *  there, mm. Larger than T_EPS so the probe lands unambiguously. */
const PROBE_EPS = 1e-4;

/** Recursion cap for Fresnel-reflected sub-ray branches (see RayTracer.traceBranch).
 *  Each extra level costs roughly one more interface's worth of tracing per
 *  surviving branch, and branches below MIN_BRANCH_POWER are pruned before
 *  recursing, so the cost stays bounded even though the recursion is real. */
const MAX_BRANCH_DEPTH = 3;

/** A branch carrying less than this fraction of the original ray's power is
 *  dropped rather than traced further — it cannot move the power budget by
 *  more than this amount, and at 0.1% it is already far below the accuracy
 *  the rest of the model claims. */
const MIN_BRANCH_POWER = 1e-3;

const DEFAULTS = Object.freeze({
  // --- geometry, mm / fraction / degrees
  radiusLeft: 60,
  radiusRight: 60,
  bodyLength: 120,
  diameter: 70,
  wallThickness: 2.0,
  fillFraction: 1.0,
  tiltDeg: 0,

  // --- optics
  nWall: 1.49,
  nLiquid: 1.333,
  rayCount: 61,
  beamDiameter: 50,
  incidenceDeg: 0,
  mode: MODE.CYLINDRICAL,
  showRays: true,
  paraxialOnly: false,
  showNormals: false,
  showAxis: true,
  // Physical-throughput mode: off ("fast geometric") traces rays only, with
  // every ray fully transmitted; on ("Fresnel-weighted") tracks how much
  // power survives Fresnel reflection, optional liquid absorption, and
  // (if branching is also on) reflected sub-rays. See buildTraceOptions().
  fresnel: true,
  liquidAttenuation: 0,   // 1/m — Beer–Lambert coefficient, only used when fresnel is on
  branching: false,       // trace reflected Fresnel sub-rays (needs fresnel on)
  dispersion: false,
  debug: false,           // colour media regions, label events, show normals

  // --- target and heating
  targetGap: 50,          // mm downstream of the rear vertex
  irradiance: 1000,       // W/m^2
  outOfPlaneWidth: 70,    // mm — only used by the cylindrical reading
  // Solar absorptivity and thermal-IR emissivity are DIFFERENT quantities in
  // general — see the note above HeatingModel — so they get independent
  // controls rather than one shared "absorptivity" slider.
  alphaSolar: 0.9,
  epsilonThermal: 0.9,
  capacity: 150,          // J/(m^2 K) — areal, e.g. thin dark card
  loss: 25,               // W/(m^2 K) — areal, linearised convection
  ambient: 20,            // °C
  radiative: true,
  duration: 120,          // s of simulated heating
  timeScale: 10           // playback multiplier
});

/** Refractive-index offsets used by the dispersion visualization. Water spans
 *  roughly 1.331 (red) to 1.337 (blue); the wall material disperses about
 *  twice as strongly. Visualization only — never used for reported numbers. */
const DISPERSION = [
  { key: 'r', dLiquid: -0.003, dWall: -0.006, color: '#ff7a6a' },
  { key: 'g', dLiquid: 0.000, dWall: 0.000, color: '#8fe08a' },
  { key: 'b', dLiquid: +0.003, dWall: +0.006, color: '#7ab6ff' }
];

const PALETTE = {
  space: '#070b14',
  ink: '#f4efe5',
  muted: '#acb4c5',
  gold: '#d7b470',
  blue: '#83b8d7',
  violet: '#9b6bff',
  rust: '#d68c70',
  green: '#8fcf9d'
};

const RAY_COLORS = {
  incoming: '#f6e7b0',
  wall: '#9fb4cc',
  liquid: '#6fd2e8',
  head: '#b9d6e2',
  exit: '#f2a049',
  tir: '#b07bff',
  missed: '#7d8798'
};

/* ============================================================================
   1 · SMALL UTILITIES
   ========================================================================== */

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const deg2rad = (d) => (d * Math.PI) / 180;

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** Compact engineering formatting for powers that span microwatts to kilowatts. */
function fmtPower(watts) {
  if (!Number.isFinite(watts)) return '—';
  const a = Math.abs(watts);
  if (a >= 1000) return `${fmt(watts / 1000, 2)} kW`;
  if (a >= 1) return `${fmt(watts, 2)} W`;
  if (a >= 1e-3) return `${fmt(watts * 1e3, 1)} mW`;
  return `${fmt(watts * 1e6, 0)} µW`;
}

/** Deterministic PRNG so the star field never flickers between frames. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return function random() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ============================================================================
   2 · Vec2 — plain-object vector helpers
   Objects rather than a class: these are allocated in inner loops and V8
   handles short-lived object literals with a stable shape extremely well.
   ========================================================================== */

const Vec2 = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  len: (a) => Math.hypot(a.x, a.y),
  normalize(a) {
    const l = Math.hypot(a.x, a.y);
    return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
  },
  /** Rotate anticlockwise about the origin. */
  rotate(a, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
  },
  /** Ray point at parameter t: p + t·d. */
  along: (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t })
};

/* ============================================================================
   3 · OPTICS PRIMITIVES
   ========================================================================== */

/**
 * Vector form of Snell's law.
 *
 * The physical input is that the component of the wave vector parallel to the
 * interface is continuous, which for unit direction vectors reads
 *      t_parallel = η · d_parallel ,  η = n1/n2
 * and is exactly n1 sinθ1 = n2 sinθ2 rewritten. Requiring |t| = 1 then fixes
 * the normal component, giving
 *      t = η d + (η cosθ1 − cosθ2) n .
 *
 * `n` must already be oriented against the incident direction, i.e. d·n < 0,
 * so that cosθ1 = −d·n is positive.
 *
 * Returns null on total internal reflection. The test is made on the same
 * quantity that would otherwise be square-rooted, so no NaN can ever escape
 * into the ray path — a failed refraction is always a clean, detected event.
 */
function refract(d, n, eta) {
  const cosI = -Vec2.dot(d, n);
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;                       // sinθ1 > n2/n1 → TIR
  const cosT = Math.sqrt(k);
  const out = {
    x: eta * d.x + (eta * cosI - cosT) * n.x,
    y: eta * d.y + (eta * cosI - cosT) * n.y
  };
  return { dir: Vec2.normalize(out), cosI, cosT };
}

/** Specular reflection, r = d − 2(d·n)n. */
function reflect(d, n) {
  const k = 2 * Vec2.dot(d, n);
  return { x: d.x - k * n.x, y: d.y - k * n.y };
}

/**
 * Unpolarised Fresnel transmittance at a dielectric interface.
 * Sunlight is unpolarised, so the two polarisations are averaged. At normal
 * incidence between air and PET this costs about 4 % per surface; near the rim
 * of the bottle, where incidence angles climb past 60°, it grows steeply and
 * is a genuine reason the edge of the aperture contributes less than its area
 * suggests.
 */
function fresnelTransmittance(n1, n2, cosI, cosT) {
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  const R = 0.5 * (rs * rs + rp * rp);
  return clamp(1 - R, 0, 1);
}

/* --------------------------------------------------------------------------
   Ray/surface intersection
   Surfaces are either circular arcs {kind:'arc', c, r, a0, span} or straight
   segments {kind:'seg', p, q, n}. Both carry a `layer` tag ('outer', 'inner',
   'free') used only for bookkeeping and drawing.
   -------------------------------------------------------------------------- */

/** Is `angle` inside the arc's anticlockwise sweep from a0 through span? */
function angleInArc(angle, arc) {
  let da = (angle - arc.a0) % TAU;
  if (da < 0) da += TAU;
  return da <= arc.span + 1e-9;
}

/**
 * Nearest intersection of the unit-direction ray p+td with a circular arc.
 * |d| = 1 makes the quadratic monic, which removes one division and a whole
 * class of cancellation problems.
 */
function intersectArc(p, d, arc, tMin) {
  const ox = p.x - arc.c.x;
  const oy = p.y - arc.c.y;
  const b = ox * d.x + oy * d.y;
  const c = ox * ox + oy * oy - arc.r * arc.r;
  const disc = b * b - c;
  if (disc < 0) return null;

  const s = Math.sqrt(disc);
  const roots = [-b - s, -b + s];               // already in ascending order

  for (let i = 0; i < 2; i++) {
    const t = roots[i];
    if (t < tMin) continue;
    const x = p.x + d.x * t;
    const y = p.y + d.y * t;
    if (!angleInArc(Math.atan2(y - arc.c.y, x - arc.c.x), arc)) continue;
    return {
      t,
      point: { x, y },
      normal: { x: (x - arc.c.x) / arc.r, y: (y - arc.c.y) / arc.r },
      surface: arc
    };
  }
  return null;
}

/** Intersection of a ray with a finite straight segment. */
function intersectSegment(p, d, seg, tMin) {
  const ex = seg.q.x - seg.p.x;
  const ey = seg.q.y - seg.p.y;
  const denom = d.x * ey - d.y * ex;            // d × e
  if (Math.abs(denom) < 1e-12) return null;     // parallel

  const rx = seg.p.x - p.x;
  const ry = seg.p.y - p.y;
  const t = (rx * ey - ry * ex) / denom;        // (r × e)/(d × e)
  const u = (rx * d.y - ry * d.x) / denom;      // (r × d)/(d × e)

  if (t < tMin || u < 0 || u > 1) return null;
  return {
    t,
    point: { x: p.x + d.x * t, y: p.y + d.y * t },
    normal: seg.n,
    surface: seg
  };
}

function intersectSurface(p, d, surface, tMin) {
  return surface.kind === 'arc'
    ? intersectArc(p, d, surface, tMin)
    : intersectSegment(p, d, surface, tMin);
}

/** All intersection parameters with a surface — used by the fill-level solver. */
function intersectAll(p, d, surface, out) {
  if (surface.kind === 'seg') {
    const hit = intersectSegment(p, d, surface, -Infinity);
    if (hit) out.push(hit.t);
    return out;
  }
  const ox = p.x - surface.c.x;
  const oy = p.y - surface.c.y;
  const b = ox * d.x + oy * d.y;
  const c = ox * ox + oy * oy - surface.r * surface.r;
  const disc = b * b - c;
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  for (const t of [-b - s, -b + s]) {
    const x = p.x + d.x * t;
    const y = p.y + d.y * t;
    if (angleInArc(Math.atan2(y - surface.c.y, x - surface.c.x), surface)) out.push(t);
  }
  return out;
}

/** Parameter at which a ray leaves an axis-aligned box. */
function boxExitT(p, d, box) {
  let t = Infinity;
  if (d.x > 1e-12) t = Math.min(t, (box.xMax - p.x) / d.x);
  else if (d.x < -1e-12) t = Math.min(t, (box.xMin - p.x) / d.x);
  if (d.y > 1e-12) t = Math.min(t, (box.yMax - p.y) / d.y);
  else if (d.y < -1e-12) t = Math.min(t, (box.yMin - p.y) / d.y);
  return t;
}

/* ============================================================================
   4 · BOTTLE GEOMETRY
   ----------------------------------------------------------------------------
   The outer profile is a capsule: a straight barrel of length L and half-height
   a = D/2, closed by circular caps of radii R_L and R_R. A cap of radius R
   meeting a barrel of half-height a must satisfy R ≥ a, and its circle is
   centred inboard of the join by √(R² − a²):

           cap arc (R_L)          barrel          cap arc (R_R)
                ╭──────────────────────────────────────╮
        ────────┤                                      ├────────  y = +a
                │            ·C_L        ·C_R          │
        ────────┤                                      ├────────  y = −a
                ╰──────────────────────────────────────╯
                x = −L/2                        x = +L/2

   The inner (liquid-facing) profile is the exact inward normal offset by the
   wall thickness t: the arcs keep their centres and lose t from their radii,
   the flats move in by t. The join between arc and flat shifts slightly
   inboard, which is a genuine property of offset curves rather than an
   approximation — it is computed, not fudged.

   Everything is built in the bottle's own frame and then rotated by the tilt
   angle. Circles are rotation-invariant, so a rotated arc is still an arc:
   only its centre and its angular range move. That is why tilt costs nothing
   in the intersection routines.
   ========================================================================== */

/**
 * Signed length of the inner barrel for a given wall thickness. Goes negative
 * when the wall is so thick that the two inner caps would overlap and the
 * cavity would pinch shut — the geometric failure mode this model must refuse
 * to enter.
 */
function innerBarrelSpan(a, RL, RR, bodyLength, t) {
  const ai = a - t;
  const cL = -bodyLength / 2 + Math.sqrt(Math.max(0, RL * RL - a * a));
  const cR = bodyLength / 2 - Math.sqrt(Math.max(0, RR * RR - a * a));
  const xLi = cL - Math.sqrt(Math.max(0, (RL - t) * (RL - t) - ai * ai));
  const xRi = cR + Math.sqrt(Math.max(0, (RR - t) * (RR - t) - ai * ai));
  return xRi - xLi;
}

/** Largest wall thickness that still leaves a simple, non-pinched cavity. */
function maxWallThickness(a, RL, RR, bodyLength) {
  const hardCap = Math.min(a - 0.4, RL - 0.4, RR - 0.4);
  if (hardCap <= 0.05) return 0.05;
  // innerBarrelSpan is monotonically non-increasing in t, so bisect.
  let lo = 0.05;
  let hi = hardCap;
  if (innerBarrelSpan(a, RL, RR, bodyLength, hi) >= 0) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (innerBarrelSpan(a, RL, RR, bodyLength, mid) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

class BottleGeometry {
  constructor(params) {
    this.warnings = [];
    this.build(params);
  }

  build(p) {
    const a = p.diameter / 2;

    // --- Clamp the radii. A cap flatter than the barrel is impossible; rather
    //     than crash or produce a self-intersecting shell, clamp and report.
    let RL = p.radiusLeft;
    let RR = p.radiusRight;
    if (RL < a) {
      RL = a;
      this.warnings.push(
        `Left cap radius raised to ${fmt(a, 1)} mm — a cap cannot be flatter than the bottle radius.`
      );
    }
    if (RR < a) {
      RR = a;
      this.warnings.push(
        `Right cap radius raised to ${fmt(a, 1)} mm — a cap cannot be flatter than the bottle radius.`
      );
    }

    // --- Clamp the wall thickness so the cavity stays simple.
    const tMax = maxWallThickness(a, RL, RR, p.bodyLength);
    let t = p.wallThickness;
    if (t > tMax) {
      t = tMax;
      this.warnings.push(
        `Wall thinned to ${fmt(tMax, 2)} mm — any thicker and the inner surfaces would intersect for this cap geometry.`
      );
    }

    const beta = deg2rad(p.tiltDeg);
    const hb = p.bodyLength / 2;
    const ai = a - t;
    const RLi = RL - t;
    const RRi = RR - t;

    // Cap circle centres (rotation-invariant radii, so only the centres move).
    const cLx = -hb + Math.sqrt(Math.max(0, RL * RL - a * a));
    const cRx = hb - Math.sqrt(Math.max(0, RR * RR - a * a));

    // Where the inner arc meets the inner flat.
    const xLi = cLx - Math.sqrt(Math.max(0, RLi * RLi - ai * ai));
    const xRi = cRx + Math.sqrt(Math.max(0, RRi * RRi - ai * ai));

    this.a = a;
    this.t = t;
    this.RL = RL;
    this.RR = RR;
    this.ai = ai;
    this.RLi = RLi;
    this.RRi = RRi;
    this.hb = hb;
    this.cLx = cLx;
    this.cRx = cRx;
    this.xLi = xLi;
    this.xRi = xRi;
    this.beta = beta;
    this.cosB = Math.cos(beta);
    this.sinB = Math.sin(beta);
    this.fillFraction = clamp(p.fillFraction, 0, 1);

    // Axial thickness between the two outer vertices, quoted in the readouts.
    this.axialThickness = (cRx + RR) - (cLx - RL);

    // --- Build the surface lists (already rotated into world coordinates).
    this.outerSurfaces = this.buildShell(a, RL, RR, cLx, cRx, -hb, hb, 'outer');
    this.innerSurfaces = this.buildShell(ai, RLi, RRi, cLx, cRx, xLi, xRi, 'inner');
    this.surfaces = this.outerSurfaces.concat(this.innerSurfaces);

    // --- Vertices, in world coordinates.
    this.frontVertex = this.toWorld({ x: cLx - RL, y: 0 });
    this.rearVertex = this.toWorld({ x: cRx + RR, y: 0 });

    // --- Rendering polylines and the bounding box.
    this.outerPath = this.buildPath(a, RL, RR, cLx, cRx, -hb, hb);
    this.innerPath = this.buildPath(ai, RLi, RRi, cLx, cRx, xLi, xRi);
    this.bbox = boundsOf(this.outerPath);

    // --- Liquid free surface (horizontal in the WORLD frame — gravity does not
    //     care how the bottle is tilted). This is a real refracting interface
    //     whenever the bottle is not completely full.
    this.solveFillLevel();
    if (this.freeSurface) {
      this.surfaces = this.surfaces.concat([this.freeSurface]);
    }
  }

  /** Rotate a point from the bottle frame into the world frame. */
  toWorld(pt) {
    return { x: pt.x * this.cosB - pt.y * this.sinB, y: pt.x * this.sinB + pt.y * this.cosB };
  }

  /** Rotate a world point back into the bottle frame. */
  toLocal(pt) {
    return { x: pt.x * this.cosB + pt.y * this.sinB, y: -pt.x * this.sinB + pt.y * this.cosB };
  }

  /**
   * Two arcs plus two flats, rotated into world coordinates.
   * The left arc sweeps anticlockwise from the +y join, through 180°, to the
   * −y join; the right arc sweeps from the −y join through 0° to the +y join.
   */
  buildShell(a, RL, RR, cLx, cRx, xJoinL, xJoinR, layer) {
    const out = [];
    const b = this.beta;

    // Left cap.
    const angTopL = Math.atan2(a, xJoinL - cLx);        // second quadrant
    const angBotL = Math.atan2(-a, xJoinL - cLx);       // third quadrant
    let spanL = angBotL - angTopL;
    while (spanL < 0) spanL += TAU;
    if (RL > 0 && spanL > 1e-9) {
      out.push({
        kind: 'arc', layer, side: 'left',
        c: this.toWorld({ x: cLx, y: 0 }),
        r: RL, a0: angTopL + b, span: spanL
      });
    }

    // Right cap.
    const angBotR = Math.atan2(-a, xJoinR - cRx);       // fourth quadrant
    const angTopR = Math.atan2(a, xJoinR - cRx);        // first quadrant
    let spanR = angTopR - angBotR;
    while (spanR < 0) spanR += TAU;
    if (RR > 0 && spanR > 1e-9) {
      out.push({
        kind: 'arc', layer, side: 'right',
        c: this.toWorld({ x: cRx, y: 0 }),
        r: RR, a0: angBotR + b, span: spanR
      });
    }

    // Barrel flats — skipped when they have zero length (a spherical bottle).
    if (xJoinR - xJoinL > 1e-9) {
      out.push({
        kind: 'seg', layer, side: 'top',
        p: this.toWorld({ x: xJoinL, y: a }),
        q: this.toWorld({ x: xJoinR, y: a }),
        n: this.toWorld({ x: 0, y: 1 })
      });
      out.push({
        kind: 'seg', layer, side: 'bottom',
        p: this.toWorld({ x: xJoinL, y: -a }),
        q: this.toWorld({ x: xJoinR, y: -a }),
        n: this.toWorld({ x: 0, y: -1 })
      });
    }

    return out;
  }

  /** Dense polyline of one shell, for filling and stroking. */
  buildPath(a, RL, RR, cLx, cRx, xJoinL, xJoinR) {
    const pts = [];
    const steps = 64;

    // Right cap, bottom → top.
    const angBotR = Math.atan2(-a, xJoinR - cRx);
    const angTopR = Math.atan2(a, xJoinR - cRx);
    for (let i = 0; i <= steps; i++) {
      const ang = lerp(angBotR, angTopR, i / steps);
      pts.push(this.toWorld({ x: cRx + RR * Math.cos(ang), y: RR * Math.sin(ang) }));
    }
    // Top flat, right → left.
    pts.push(this.toWorld({ x: xJoinL, y: a }));
    /* Left cap, top → bottom. The two join angles straddle 180°, so
       interpolating directly between them would sweep the short way through 0°
       and trace the WRONG half of the circle. Sweeping anticlockwise by the
       normalised span is the same convention buildShell uses, and keeps the
       drawn outline in agreement with the surfaces the tracer actually sees. */
    const angTopL = Math.atan2(a, xJoinL - cLx);
    const angBotL = Math.atan2(-a, xJoinL - cLx);
    let spanL = angBotL - angTopL;
    while (spanL < 0) spanL += TAU;
    for (let i = 0; i <= steps; i++) {
      const ang = angTopL + spanL * (i / steps);
      pts.push(this.toWorld({ x: cLx + RL * Math.cos(ang), y: RL * Math.sin(ang) }));
    }
    // Bottom flat closes the loop.
    pts.push(this.toWorld({ x: xJoinR, y: -a }));
    return pts;
  }

  /* ---- Region tests -------------------------------------------------------
     Both are exact rather than polygonal: the capsule splits cleanly into
     three x-ranges, and in each the test is a single comparison. This is what
     makes the medium lookup cheap enough to call twice per refraction. */

  insideOuter(worldPt) {
    const p = this.toLocal(worldPt);
    if (Math.abs(p.y) > this.a) return false;
    if (p.x < -this.hb) {
      const dx = p.x - this.cLx;
      return dx * dx + p.y * p.y <= this.RL * this.RL;
    }
    if (p.x > this.hb) {
      const dx = p.x - this.cRx;
      return dx * dx + p.y * p.y <= this.RR * this.RR;
    }
    return true;
  }

  insideInner(worldPt) {
    const p = this.toLocal(worldPt);
    if (Math.abs(p.y) > this.ai) return false;
    if (p.x < this.xLi) {
      const dx = p.x - this.cLx;
      return dx * dx + p.y * p.y <= this.RLi * this.RLi;
    }
    if (p.x > this.xRi) {
      const dx = p.x - this.cRx;
      return dx * dx + p.y * p.y <= this.RRi * this.RRi;
    }
    return true;
  }

  isLiquidAt(worldPt) {
    if (this.fillFraction >= 1) return true;
    if (this.fillFraction <= 0) return false;
    return worldPt.y <= this.fillLevel;
  }

  /**
   * Refractive index at a world point.
   * This single function is the entire medium bookkeeping of the tracer.
   * Sampling it either side of an interface is more robust than carrying a
   * medium stack, because it cannot desynchronise from the geometry — a ray
   * that grazes a junction still gets a consistent answer.
   */
  mediumAt(worldPt, idx) {
    if (!this.insideOuter(worldPt)) return idx.air;
    if (!this.insideInner(worldPt)) return idx.wall;
    return this.isLiquidAt(worldPt) ? idx.liquid : idx.air;
  }

  /* ---- Liquid level ------------------------------------------------------- */

  /** Horizontal extent of the cavity at world height y, by casting a ray. */
  cavitySpanAt(y) {
    const origin = { x: this.bbox.xMin - 10, y };
    const dir = { x: 1, y: 0 };
    const ts = [];
    for (const s of this.innerSurfaces) intersectAll(origin, dir, s, ts);
    if (ts.length < 2) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of ts) {
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    if (hi - lo < 1e-9) return null;
    return { xMin: origin.x + lo, xMax: origin.x + hi };
  }

  /**
   * Find the world height at which a horizontal plane cuts off the requested
   * fraction of the cavity's cross-sectional area. Solved by building the
   * cumulative area profile once and inverting it by interpolation, which is
   * both cheaper and more robust than bisecting on a noisy area integral.
   */
  solveFillLevel() {
    this.freeSurface = null;
    this.fillLevel = Infinity;

    if (this.fillFraction >= 1) return;                 // brim full, no interface
    if (this.fillFraction <= 0) { this.fillLevel = -Infinity; return; }

    const innerBounds = boundsOf(this.innerPath);
    const yLo = innerBounds.yMin;
    const yHi = innerBounds.yMax;
    const steps = 200;
    const dy = (yHi - yLo) / steps;

    // Cumulative area from the bottom up, trapezoid rule on the chord width.
    const cumulative = new Float64Array(steps + 1);
    let prevWidth = 0;
    for (let i = 1; i <= steps; i++) {
      const y = yLo + i * dy;
      const span = this.cavitySpanAt(y - dy * 0.5);
      const width = span ? span.xMax - span.xMin : 0;
      cumulative[i] = cumulative[i - 1] + 0.5 * (prevWidth + width) * dy;
      prevWidth = width;
    }

    const total = cumulative[steps];
    if (total <= 0) return;

    const wanted = total * this.fillFraction;
    let level = yHi;
    for (let i = 1; i <= steps; i++) {
      if (cumulative[i] >= wanted) {
        const f = (wanted - cumulative[i - 1]) / Math.max(1e-12, cumulative[i] - cumulative[i - 1]);
        level = yLo + (i - 1 + f) * dy;
        break;
      }
    }

    this.fillLevel = level;
    const span = this.cavitySpanAt(level);
    if (!span) return;

    this.freeSurface = {
      kind: 'seg', layer: 'free', side: 'free',
      p: { x: span.xMin, y: level },
      q: { x: span.xMax, y: level },
      n: { x: 0, y: 1 }
    };
  }

  /** Cavity polygon clipped to the liquid, for rendering. */
  liquidPath() {
    if (this.fillFraction <= 0) return [];
    if (this.fillFraction >= 1) return this.innerPath;
    return clipBelow(this.innerPath, this.fillLevel);
  }
}

function boundsOf(points) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  return { xMin, xMax, yMin, yMax };
}

/** Sutherland–Hodgman clip of a closed polygon against the half-plane y ≤ level. */
function clipBelow(points, level) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const nxt = points[(i + 1) % n];
    const curIn = cur.y <= level;
    const nxtIn = nxt.y <= level;
    if (curIn) out.push(cur);
    if (curIn !== nxtIn) {
      const f = (level - cur.y) / (nxt.y - cur.y);
      out.push({ x: lerp(cur.x, nxt.x, f), y: level });
    }
  }
  return out;
}

/* ============================================================================
   5 · RAY TRACER
   ----------------------------------------------------------------------------
   One low-level stepper, shared by two callers. At each step it finds the
   nearest event among the bottle surfaces, the target plane, and the world
   boundary — that event-finding logic is `nextRayEvent`, deliberately pulled
   out as a standalone function rather than kept private to `trace()`, so the
   same general machinery drives both the primary ray (`trace`) and the
   optional reflected sub-rays spawned at a partial-Fresnel interface
   (`traceBranch`). The four-interface sequence the problem describes —
   air→wall→liquid→wall→air — is not hard-coded anywhere: it simply emerges
   from a full bottle at normal incidence. Partial fills, tilts, and total
   internal reflection produce different sequences automatically, and so does
   every reflected branch.
   ========================================================================== */

/** Nearest bottle-surface intersection ahead of p, in direction d. */
function nearestBottleSurface(geom, p, d) {
  let best = null;
  const list = geom.surfaces;
  for (let i = 0; i < list.length; i++) {
    const hit = intersectSurface(p, d, list[i], T_EPS);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

/**
 * The next thing a ray meets: a bottle surface, the target screen, or the
 * edge of the traced world. Returns null only if the ray is moving parallel
 * to every remaining boundary, which cannot happen inside a finite box.
 */
function nextRayEvent(geom, targetX, box, p, d) {
  const hit = nearestBottleSurface(geom, p, d);
  const tSurface = hit ? hit.t : Infinity;

  // The target plane is a vertical absorbing screen.
  let tTarget = Infinity;
  if (d.x > 1e-12) {
    const t = (targetX - p.x) / d.x;
    if (t > T_EPS) tTarget = t;
  }
  const tBox = boxExitT(p, d, box);

  const tEnd = Math.min(tSurface, tTarget, tBox);
  if (!Number.isFinite(tEnd)) return null;

  const point = Vec2.along(p, d, tEnd);
  if (tTarget <= tSurface && tTarget <= tBox) return { kind: 'target', t: tEnd, point, hit: null };
  if (tBox <= tSurface) return { kind: 'box', t: tEnd, point, hit: null };
  return { kind: 'surface', t: tEnd, point, hit };
}

/**
 * Normalise the trace-options argument. A plain boolean is accepted as
 * shorthand for "physical throughput on/off with nothing else enabled" —
 * that is what dispersion bundles pass, since they are a visualization that
 * never needs absorption or branching.
 */
function normalizeTraceOptions(options) {
  if (typeof options === 'boolean') {
    return {
      fresnel: options, liquidAttenuationPerMm: 0, branching: false,
      maxBranchDepth: 0, minBranchPower: 1, collectBranches: false
    };
  }
  const o = options || {};
  return {
    fresnel: !!o.fresnel,
    liquidAttenuationPerMm: o.fresnel ? (o.liquidAttenuationPerMm || 0) : 0,
    branching: !!o.fresnel && !!o.branching,
    maxBranchDepth: o.maxBranchDepth != null ? o.maxBranchDepth : MAX_BRANCH_DEPTH,
    minBranchPower: o.minBranchPower != null ? o.minBranchPower : MIN_BRANCH_POWER,
    collectBranches: !!o.fresnel && !!o.branching && !!o.collectBranches
  };
}

class RayTracer {
  constructor(geometry, options) {
    this.geom = geometry;
    this.targetX = options.targetX;
    this.box = options.box;
  }

  /**
   * Trace the primary ray. `options` controls physical throughput:
   *   - fresnel off               → "fast geometric" mode: every ray is fully
   *                                  transmitted (throughput ≡ 1), for a quick
   *                                  look at where the light goes.
   *   - fresnel on                → "Fresnel-weighted" mode: unpolarised
   *                                  Fresnel transmittance is tracked at every
   *                                  interface, so `throughput` is the actual
   *                                  fraction of the ray's power that survives.
   *   - + liquidAttenuationPerMm  → Beer–Lambert absorption is also applied
   *                                  over path length actually spent in the
   *                                  liquid (not the head-space air, and not
   *                                  the wall).
   *   - + branching               → at every interface where the ray is only
   *                                  PARTLY reflected (not total internal
   *                                  reflection), a secondary ray carrying the
   *                                  reflected fraction is also traced
   *                                  recursively (see traceBranch), and any
   *                                  power it delivers to the target is
   *                                  reported separately as `branchPower`.
   */
  trace(origin, dir, idx, options) {
    const opts = normalizeTraceOptions(options);
    const geom = this.geom;
    const segments = [];

    let p = { x: origin.x, y: origin.y };
    let d = { x: dir.x, y: dir.y };
    let fresnelThroughput = 1;
    let absorptionThroughput = 1;
    let throughput = 1;
    let tir = false;
    let entered = false;
    let status = 'lost';
    let exitRay = null;
    let interfaces = 0;
    let maxIncidence = 0;
    let branchPower = 0;
    const branchSegments = opts.collectBranches ? [] : null;
    const events = [];

    for (let step = 0; step < MAX_SEGMENTS; step++) {
      const event = nextRayEvent(geom, this.targetX, this.box, p, d);
      if (!event) { status = 'escaped'; break; }

      const end = event.point;
      const mid = Vec2.along(p, d, event.t * 0.5);
      const insideNow = geom.insideOuter(mid);
      const region = regionTag(geom, mid, insideNow, entered);

      segments.push({ a: p, b: end, region, tir });
      if (insideNow) entered = true;
      if (!insideNow && entered) exitRay = { p, d };

      // Beer–Lambert absorption over the path length actually spent in the
      // liquid. Applied per segment (not once at the end) so that a branch
      // spawned partway through sees the correct throughput SO FAR.
      if (region === 'liquid' && opts.liquidAttenuationPerMm > 0) {
        const atten = Math.exp(-opts.liquidAttenuationPerMm * event.t);
        absorptionThroughput *= atten;
        throughput *= atten;
      }

      if (event.kind === 'target') { status = 'hit'; p = end; break; }
      if (event.kind === 'box') { status = 'escaped'; p = end; break; }

      // --- Refraction / reflection at the surface -----------------------------
      // Orient the normal against the incident direction so cosθ1 > 0.
      let n = event.hit.normal;
      if (Vec2.dot(n, d) > 0) n = { x: -n.x, y: -n.y };

      const before = Vec2.along(event.hit.point, d, -PROBE_EPS);
      const after = Vec2.along(event.hit.point, d, PROBE_EPS);
      const n1 = geom.mediumAt(before, idx);
      const n2 = geom.mediumAt(after, idx);

      p = event.hit.point;

      // Junction points (arc meeting flat, or the free surface meeting the wall)
      // can report the same medium either side. Physically nothing happens
      // there, so pass straight through rather than dividing by a phantom
      // index ratio.
      if (Math.abs(n1 - n2) < 1e-9) continue;

      interfaces++;
      const result = refract(d, n, n1 / n2);
      const cosI = -Vec2.dot(d, n);
      maxIncidence = Math.max(maxIncidence, Math.acos(clamp(cosI, -1, 1)));

      if (!result) {
        // Total internal reflection: no transmitted direction exists, and all
        // the power stays with the reflected ray — nothing to branch, the
        // primary path simply continues as the reflection.
        tir = true;
        if (events.length < 24) events.push({ point: p, label: 'TIR', n1, n2 });
        d = Vec2.normalize(reflect(d, n));
      } else {
        const T = opts.fresnel ? fresnelTransmittance(n1, n2, result.cosI, result.cosT) : 1;

        // Spawn a reflected branch BEFORE updating throughput, so it carries
        // exactly the power that arrived at this interface times (1 − T).
        if (opts.branching && T < 1) {
          const branchStartPower = throughput * (1 - T);
          if (branchStartPower >= opts.minBranchPower) {
            const reflDir = Vec2.normalize(reflect(d, n));
            branchPower += this.traceBranch(
              p, reflDir, idx, opts, branchStartPower, 1, branchSegments
            );
          }
        }

        if (events.length < 24) {
          events.push({ point: p, label: opts.fresnel ? `T=${T.toFixed(2)}` : 'refract', n1, n2 });
        }

        fresnelThroughput *= T;
        throughput *= T;
        d = result.dir;
      }
    }

    return {
      segments,
      status,
      tir,
      entered,
      throughput,
      fresnelThroughput,
      absorptionThroughput,
      interfaces,
      maxIncidence,
      exitRay,
      endPoint: p,
      branchPower,
      branchSegments,
      /** Interface events for the debug overlay: where, and what happened. */
      events,
      /** Signed height where the ray met the screen, or null. */
      hitY: status === 'hit' ? p.y : null
    };
  }

  /**
   * Trace one reflected sub-ray, recursively. This is the SAME event-finding
   * and refraction machinery as `trace()`, called on a ray that starts partway
   * through the bottle carrying only the reflected fraction of the power that
   * reached its origin. At each further interface it may itself split again
   * (a second partial reflection), capped by `opts.maxBranchDepth` and pruned
   * once the carried power falls below `opts.minBranchPower` — both are
   * necessary because without them the branch count grows as (number of
   * interfaces)^depth.
   *
   * Only the FIRST level of branching is collected for the optional debug
   * overlay (`branchSegments`); deeper levels still contribute to the power
   * total but are not drawn, to keep the overlay legible. This function
   * returns the total power (as a fraction of the ORIGINAL ray's power) that
   * this branch and its descendants deliver to the target screen — power that
   * escapes the field of view or is absorbed is simply not counted, exactly
   * as for the primary ray.
   */
  traceBranch(origin, dir, idx, opts, power, depth, collect) {
    if (depth > opts.maxBranchDepth || power < opts.minBranchPower) return 0;

    const geom = this.geom;
    let p = { x: origin.x, y: origin.y };
    let d = { x: dir.x, y: dir.y };
    let throughput = power;
    let recovered = 0;
    const segments = collect && depth === 1 ? [] : null;

    for (let step = 0; step < MAX_SEGMENTS; step++) {
      const event = nextRayEvent(geom, this.targetX, this.box, p, d);
      if (!event) break;

      const end = event.point;
      const mid = Vec2.along(p, d, event.t * 0.5);
      // A branch always starts inside the bottle, so it is always "entered"
      // for the purpose of region tagging (it can never be an 'incoming' ray).
      const region = regionTag(geom, mid, geom.insideOuter(mid), true);
      if (segments) segments.push({ a: p, b: end, region });

      if (region === 'liquid' && opts.liquidAttenuationPerMm > 0) {
        throughput *= Math.exp(-opts.liquidAttenuationPerMm * event.t);
      }

      if (event.kind === 'target') { recovered = throughput; p = end; break; }
      if (event.kind === 'box') { p = end; break; }

      let n = event.hit.normal;
      if (Vec2.dot(n, d) > 0) n = { x: -n.x, y: -n.y };

      const before = Vec2.along(event.hit.point, d, -PROBE_EPS);
      const after = Vec2.along(event.hit.point, d, PROBE_EPS);
      const n1 = geom.mediumAt(before, idx);
      const n2 = geom.mediumAt(after, idx);
      p = event.hit.point;

      if (Math.abs(n1 - n2) < 1e-9) continue;

      const result = refract(d, n, n1 / n2);
      if (!result) {
        // Total internal reflection within a branch: the same photon keeps
        // going, so this does not consume a level of recursion depth.
        d = Vec2.normalize(reflect(d, n));
        continue;
      }

      const T = opts.fresnel ? fresnelTransmittance(n1, n2, result.cosI, result.cosT) : 1;

      if (T < 1 && depth < opts.maxBranchDepth) {
        const subPower = throughput * (1 - T);
        if (subPower >= opts.minBranchPower) {
          const reflDir = Vec2.normalize(reflect(d, n));
          recovered += this.traceBranch(p, reflDir, idx, opts, subPower, depth + 1, null);
        }
      }

      throughput *= T;
      d = result.dir;
    }

    if (segments && collect) collect.push({ segments, power });
    return recovered;
  }
}

function regionTag(geom, mid, insideOuter, alreadyEntered) {
  if (!insideOuter) return alreadyEntered ? 'exit' : 'incoming';
  if (!geom.insideInner(mid)) return 'wall';
  return geom.isLiquidAt(mid) ? 'liquid' : 'head';
}

/**
 * Static medium classification of a point, independent of any ray history —
 * unlike regionTag (which needs to know whether a ray has already entered, to
 * tell 'incoming' from 'exit'). Used by the debug region-colouring overlay,
 * which paints the whole field rather than following a specific ray. Robust
 * to tilt and partial fill because it is built entirely from
 * BottleGeometry's own region tests, which already account for both.
 */
function classifyRegion(geom, point) {
  if (!geom.insideOuter(point)) return 'air';
  if (!geom.insideInner(point)) return 'wall';
  return geom.isLiquidAt(point) ? 'liquid' : 'head';
}

/**
 * Translate UI parameters into RayTracer options.
 * `collect` gates whether branch segments are retained for the debug overlay
 * — off by default (e.g. for the many throwaway models a parameter sweep
 * builds) since nothing ever reads them there.
 */
function buildTraceOptions(p, collect) {
  return {
    fresnel: !!p.fresnel,
    liquidAttenuationPerMm: p.fresnel ? (p.liquidAttenuation || 0) / 1000 : 0,
    branching: !!p.fresnel && !!p.branching,
    maxBranchDepth: MAX_BRANCH_DEPTH,
    minBranchPower: MIN_BRANCH_POWER,
    collectBranches: !!collect
  };
}

/* ============================================================================
   6 · BOTTLE LENS MODEL
   Owns the parameters, builds the geometry, launches the beam, and holds the
   traced rays. Contains no DOM access whatsoever, which is what lets the
   parameter sweep construct dozens of throwaway copies.
   ========================================================================== */

class BottleLensModel {
  constructor(params) {
    this.p = params;
    this.geom = new BottleGeometry(params);

    const geom = this.geom;
    this.rearVertex = geom.rearVertex;
    this.frontVertex = geom.frontVertex;
    this.targetX = geom.rearVertex.x + params.targetGap;

    // Vertical half-extent of the world: enough to contain the bottle, the
    // beam, and a little air.
    this.yHalf = Math.max(geom.a, params.beamDiameter / 2, Math.abs(geom.bbox.yMax)) * 1.45 + 6;

    this.xLaunch = geom.bbox.xMin - 55;
    this.box = {
      xMin: this.xLaunch - 2,
      xMax: this.targetX + 45,
      yMin: -this.yHalf,
      yMax: this.yHalf
    };

    this.tracer = new RayTracer(geom, { targetX: this.targetX, box: this.box });
    this.indices = { air: 1.0, wall: params.nWall, liquid: params.nLiquid };

    this.buildBeam();
    this.traceAll();
  }

  /**
   * Lay out the collimated beam.
   *
   * Rays are spaced evenly across a line PERPENDICULAR to the beam, which is
   * what "collimated with diameter B" actually means, then slid along their
   * own directions back to a common launch plane. Sliding a ray along itself
   * does not change the ray, so the perpendicular spacing survives exactly
   * while the picture stays tidy.
   */
  buildBeam() {
    const p = this.p;
    const gamma = deg2rad(p.incidenceDeg);
    const u = { x: Math.cos(gamma), y: Math.sin(gamma) };
    const uPerp = { x: -Math.sin(gamma), y: Math.cos(gamma) };

    // The paraxial toggle narrows the aperture rather than changing the physics,
    // which is exactly what "paraxial" means: stay where sinθ ≈ θ holds.
    const effectiveBeam = p.paraxialOnly
      ? Math.min(p.beamDiameter, 0.22 * p.diameter)
      : p.beamDiameter;

    const n = Math.max(1, Math.round(p.rayCount));
    const dh = n > 1 ? effectiveBeam / (n - 1) : effectiveBeam;

    this.beamDirection = u;
    this.effectiveBeam = effectiveBeam;
    this.raySpacing = dh;

    const heights = [];
    const weights = [];
    for (let i = 0; i < n; i++) {
      const h = n > 1 ? -effectiveBeam / 2 + i * dh : 0;
      heights.push(h);

      const isEdge = n > 1 && (i === 0 || i === n - 1);

      if (p.mode === MODE.REVOLVED) {
        /* Revolving the section means a ray at height h stands for a whole
           annulus of radius h, so its weight is that annulus's area.
           Only the UPPER half of the aperture carries power: the rays below
           the axis are the mirror image of the same rings, and counting them
           too would both double the flux and — because ±h land at identical
           radii — halve the apparent ray spacing at the target, corrupting the
           density estimate. They are still traced and drawn, so the picture
           stays symmetric; they simply carry no energy. */
        if (h < -1e-9) {
          weights.push(0);
        } else {
          const inner = Math.max(0, h - dh / 2);
          // The outermost ring must stop at the beam edge, not half a step past
          // it, or the collecting area silently grows.
          const outer = i === n - 1 ? h : h + dh / 2;
          weights.push(Math.PI * (outer * outer - inner * inner));
        }
      } else {
        /* Extruded: each ray owns a strip one spacing wide — except the two
           at the ends of the aperture, which own only the inner half of theirs.
           This is the trapezoid rule, and it is what makes the weights sum to
           exactly the beam width rather than N/(N−1) times it. Getting this
           wrong tilts every irradiance by a percent or two, which is small
           enough to hide and large enough to matter. */
        weights.push(isEdge ? dh / 2 : dh);
      }
    }

    // Normalise so the weights sum to exactly the geometric collecting area.
    const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
    this.rayFractions = weights.map((w) => w / sum);

    // Collecting area in m², which is where mm → m happens.
    this.collectingAreaM2 =
      p.mode === MODE.REVOLVED
        ? Math.PI * Math.pow(effectiveBeam / 2, 2) * 1e-6
        : effectiveBeam * p.outOfPlaneWidth * 1e-6;

    this.launchedPower = p.irradiance * this.collectingAreaM2;

    // Slide each launch point back onto the common plane x = xLaunch.
    this.launchPoints = heights.map((h) => {
      const q = {
        x: this.xLaunch + h * uPerp.x,
        y: h * uPerp.y
      };
      const shift = (q.x - this.xLaunch) / u.x;
      return { x: q.x - shift * u.x, y: q.y - shift * u.y };
    });
    this.rayHeights = heights;
  }

  traceAll() {
    const p = this.p;
    const rays = [];
    const opts = buildTraceOptions(p, true);

    for (let i = 0; i < this.launchPoints.length; i++) {
      const trace = this.tracer.trace(
        this.launchPoints[i],
        this.beamDirection,
        this.indices,
        opts
      );
      rays.push({
        height: this.rayHeights[i],
        fraction: this.rayFractions[i],
        power: this.launchedPower * this.rayFractions[i] * trace.throughput,
        trace
      });
    }
    this.rays = rays;

    // Dispersion bundles are traced separately and used only for drawing —
    // fast-geometric options, since they never need absorption or branching.
    this.dispersionRays = null;
    if (p.dispersion) {
      this.dispersionRays = DISPERSION.map((band) => ({
        color: band.color,
        traces: this.launchPoints.map((origin) =>
          this.tracer.trace(
            origin,
            this.beamDirection,
            {
              air: 1.0,
              wall: p.nWall + band.dWall,
              liquid: p.nLiquid + band.dLiquid
            },
            false
          )
        )
      }));
    }
  }

  /** Unit vector along the optical (bottle) axis. */
  axisDirection() {
    return { x: this.geom.cosB, y: this.geom.sinB };
  }

  /** Height at which the optical axis crosses the target plane. */
  axisYAtTarget() {
    // Axis passes through the origin, so y = x·tanβ.
    return this.targetX * Math.tan(this.geom.beta);
  }
}

/* ============================================================================
   7 · OPTICAL ANALYZER
   Turns a set of traced rays into the numbers a student wants: where the focus
   is, how badly it is aberrated, how much energy lands where, and how far the
   ray-density estimate can honestly be pushed.
   ========================================================================== */

class OpticalAnalyzer {
  constructor(model) {
    this.model = model;
    this.analyze();
  }

  analyze() {
    this.axisCrossings();
    this.bestFocus();
    this.targetProfile();
    this.fateBreakdown();
  }

  /* ---- Axis crossings and spherical aberration ---------------------------- */

  axisCrossings() {
    const m = this.model;
    const uAx = m.axisDirection();
    const nAx = { x: -uAx.y, y: uAx.x };
    const rear = m.rearVertex;
    const crossings = [];

    for (const ray of m.rays) {
      const ex = ray.trace.exitRay;
      if (!ex || ray.trace.tir) continue;

      // Perpendicular offset from the axis, and its rate of change along the
      // ray. The crossing is simply where the offset reaches zero.
      const offset = Vec2.dot(ex.p, nAx);
      const slope = Vec2.dot(ex.d, nAx);
      if (Math.abs(slope) < 1e-12) continue;

      const s = -offset / slope;
      if (s <= 0) continue;                       // diverging: crosses behind

      const point = Vec2.along(ex.p, ex.d, s);
      const distance = Vec2.dot(Vec2.sub(point, rear), uAx);
      if (distance <= 0) continue;                // crossed inside the bottle

      crossings.push({ height: ray.height, distance, point });
    }

    crossings.sort((a, b) => Math.abs(a.height) - Math.abs(b.height));
    this.crossings = crossings;

    if (crossings.length === 0) {
      this.paraxialFocus = null;
      this.marginalFocus = null;
      this.longitudinalAberration = null;
      this.converging = false;
      return;
    }

    // Paraxial estimate: only rays close enough to the axis that sinθ ≈ θ is
    // defensible — the innermost fifth of the bundle, never fewer than three.
    const nPara = Math.max(3, Math.min(crossings.length, Math.round(crossings.length * 0.2)));
    let sum = 0;
    for (let i = 0; i < nPara; i++) sum += crossings[i].distance;
    this.paraxialFocus = sum / nPara;

    // Marginal estimate: the outermost tenth.
    const nMarg = Math.max(2, Math.min(crossings.length, Math.round(crossings.length * 0.1)));
    let sumM = 0;
    for (let i = crossings.length - nMarg; i < crossings.length; i++) sumM += crossings[i].distance;
    this.marginalFocus = sumM / nMarg;

    this.longitudinalAberration = this.marginalFocus - this.paraxialFocus;
    this.converging = crossings.length >= Math.max(2, m.rays.length * 0.2);
  }

  /* ---- Spot size at an arbitrary plane ------------------------------------ */

  /**
   * Heights at which the exiting rays cross a vertical plane.
   * Exit rays are straight lines, so any plane can be evaluated in O(N) with
   * no re-tracing — which is what makes the best-focus scan essentially free.
   */
  hitsAtPlane(planeX, enteredOnly) {
    const hits = [];
    for (const ray of this.model.rays) {
      const ex = ray.trace.exitRay;
      if (!ex) {
        // Rays that never entered the bottle still land on the screen and are
        // part of the honest background, unless we are hunting for the focus.
        if (enteredOnly || ray.trace.status !== 'hit') continue;
        hits.push({ y: ray.trace.hitY, p: ray.power });
        continue;
      }
      if (ex.d.x <= 1e-12) continue;
      const s = (planeX - ex.p.x) / ex.d.x;
      if (s <= 0) continue;
      hits.push({ y: ex.p.y + ex.d.y * s, p: ray.power });
    }
    return hits;
  }

  /**
   * Narrowest interval containing 50 % of the power — a robust spot-width
   * metric that, unlike a full width at half maximum, survives multi-peaked
   * and asymmetric distributions such as those produced by a caustic.
   *
   * The power is treated as spread continuously over the same ray tubes the
   * irradiance profile uses, rather than as spikes at the ray positions.
   * Measuring ray-centre to ray-centre instead undercounts by one spacing,
   * which for a broad distribution is a systematic (1 + 1/N) bias in every
   * concentration and temperature downstream of it.
   */
  static width50(hits) {
    const samples = toSamples(hits, (h) => h.y);
    if (!samples.length) return { width: NaN, centre: NaN, total: 0 };

    const tiles = buildTiles(samples);
    const { edges, cumulative, total } = tileCdf(tiles);
    if (total <= 0) return { width: NaN, centre: NaN, total: 0 };

    const half = total * 0.5;
    let best = Infinity;
    let bestCentre = samples[0].c;

    // The optimum window has at least one endpoint at a tile edge, because the
    // cumulative distribution is piecewise linear between them.
    for (const edge of edges) {
      const here = cdfAt(edges, cumulative, edge);

      if (here + half <= total + 1e-12) {
        const b = invCdf(edges, cumulative, here + half);
        if (b - edge < best) { best = b - edge; bestCentre = 0.5 * (b + edge); }
      }
      if (here - half >= -1e-12) {
        const a = invCdf(edges, cumulative, here - half);
        if (edge - a < best) { best = edge - a; bestCentre = 0.5 * (a + edge); }
      }
    }

    return { width: Number.isFinite(best) ? best : NaN, centre: bestCentre, total };
  }

  /**
   * Diameter of the circle, centred on the optical axis, containing 50 % of
   * the power. The rotationally symmetric analogue of width50 — the standard
   * "encircled energy" metric. It must be centred on the axis rather than on
   * a centroid, because that is the only place the revolved model has
   * symmetry.
   */
  static diameter50(hits, axisY) {
    const samples = toSamples(hits, (h) => Math.abs(h.y - axisY));
    if (!samples.length) return { width: NaN, centre: axisY, total: 0 };

    const tiles = buildTiles(samples);
    let total = 0;
    for (const t of tiles) total += t.p;
    if (total <= 0) return { width: NaN, centre: axisY, total: 0 };

    // Walk outward; inside the tile that straddles the halfway mark, the
    // enclosed power grows with AREA, so invert in r² rather than in r.
    const half = total * 0.5;
    let cum = 0;
    let r50 = tiles[tiles.length - 1].hi;
    for (const t of tiles) {
      if (cum + t.p >= half) {
        const lo2 = Math.max(0, t.lo) ** 2;
        const hi2 = t.hi ** 2;
        r50 = hi2 > lo2
          ? Math.sqrt(lo2 + ((half - cum) / t.p) * (hi2 - lo2))
          : t.hi;
        break;
      }
      cum += t.p;
    }
    return { width: 2 * r50, centre: axisY, total };
  }

  spotAtPlane(planeX, enteredOnly) {
    const hits = this.hitsAtPlane(planeX, enteredOnly);
    return this.model.p.mode === MODE.REVOLVED
      ? OpticalAnalyzer.diameter50(hits, planeX * Math.tan(this.model.geom.beta))
      : OpticalAnalyzer.width50(hits);
  }

  /**
   * Scan downstream planes for the tightest spot. This is the "circle of least
   * confusion", which for an aberrated lens sits noticeably INSIDE the
   * paraxial focus — a distinction worth measuring rather than assuming.
   */
  bestFocus() {
    const m = this.model;
    let bestGap = m.p.targetGap;
    let bestWidth = Infinity;

    /* Coarse sweep, then two local refinements. A single 2 mm-resolution pass
       finds the right neighbourhood but routinely misses the minimum itself by
       tens of percent, because the spot width near focus is a sharp V. Since
       exit rays are straight lines, every extra plane costs only O(N), so the
       refinement is essentially free. */
    const scan = (lo, hi, steps) => {
      for (let i = 0; i <= steps; i++) {
        const gap = lerp(lo, hi, i / steps);
        const spot = this.spotAtPlane(m.rearVertex.x + gap, true);
        if (Number.isFinite(spot.width) && spot.width < bestWidth) {
          bestWidth = spot.width;
          bestGap = gap;
        }
      }
    };

    scan(2, 320, 160);
    if (bestWidth < Infinity) {
      let window = (320 - 2) / 160;
      for (let pass = 0; pass < 2; pass++) {
        scan(Math.max(2, bestGap - window), Math.min(320, bestGap + window), 40);
        window /= 20;
      }
    }

    this.bestFocusGap = bestWidth < Infinity ? bestGap : null;
    this.bestFocusWidth = bestWidth < Infinity ? bestWidth : null;
  }

  /* ---- Irradiance across the target plane --------------------------------- */

  targetProfile() {
    const m = this.model;
    const p = m.p;
    const axisY = m.axisYAtTarget();

    // Power actually delivered to the screen, and its distribution.
    const hits = [];
    let delivered = 0;
    for (const ray of m.rays) {
      if (ray.trace.status !== 'hit') continue;
      hits.push({ y: ray.trace.hitY, p: ray.power });
      delivered += ray.power;
    }
    this.deliveredPower = delivered;
    this.reachFraction = m.rays.length ? hits.length / m.rays.length : 0;

    const revolved = p.mode === MODE.REVOLVED;
    const spot = revolved
      ? OpticalAnalyzer.diameter50(hits, axisY)
      : OpticalAnalyzer.width50(hits);

    /* ---- Finite-Sun blur ---------------------------------------------------
       The traced beam is perfectly parallel, but the Sun is not a point: it
       subtends ~0.53°, so every image of it is smeared by at least f·Θ. This
       blur is GEOMETRY-DEPENDENT, because the two third-dimension models put
       the transverse directions to different use:

         - Revolved (rotationally symmetric) mode: the spot is a disc and, by
           the model's own symmetry, the finite-Sun blur applies equally in
           BOTH transverse directions — which is exactly what convolving the
           single radial "diameter50" measure with a blur of the same
           magnitude already represents. One number, one blur, done.

         - Cylindrical mode: only the traced (in-plane) dimension is ever
           brought to a focus at all — there is no curvature along the
           cylinder axis, so that direction never had a "spot size" to blur in
           the first place. Its extent is set by the illuminated aperture
           (outOfPlaneWidth) and is left alone here; the finite-Sun correction
           below applies only to spotWidth, the focused in-plane dimension.

       The geometric (ray-traced) spread and the Sun's own image are
       independent blur contributions, so they are combined in QUADRATURE —
       sqrt(a² + b²) — rather than by taking whichever is larger. That is the
       standard way to combine two independent smooth spreads: a spot already
       comparable in size to the solar blur comes out measurably wider than
       either alone, not simply clamped to the bigger number. A separate,
       purely NUMERICAL floor (the detector cell) is then applied on top via
       max(), because that one is a resolution limit, not a physical blur. */
    /* When the bundle does not converge at all (no paraxial focus — e.g. an
       index-matched or diverging "lens"), there is no image of the Sun being
       formed, so there is nothing for the Sun's finite size to blur: the
       blur is 0 rather than computed from an arbitrary reference length like
       the target distance. This matters in practice, not just at the n=1
       edge case — any sufficiently weak or strongly aberrated bundle that
       fails to cross the axis hits the same branch. */
    this.solarBlur = Number.isFinite(this.paraxialFocus)
      ? Math.abs(this.paraxialFocus) * SUN_ANGULAR_DIAMETER
      : 0;
    this.blurDimensions = revolved ? 2 : 1;

    const rawWidth = Number.isFinite(spot.width) ? spot.width : NaN;
    this.rawSpotWidth = rawWidth;
    const blurredWidth = Number.isFinite(rawWidth)
      ? Math.sqrt(rawWidth * rawWidth + this.solarBlur * this.solarBlur)
      : NaN;
    this.blurredSpotWidth = blurredWidth;
    this.spotWidth = Number.isFinite(blurredWidth)
      ? Math.max(blurredWidth, PROFILE_BIN_MM)
      : NaN;
    this.spotCentre = spot.centre;
    // "Sun-limited" means the Sun's own blur is the larger of the two
    // independent contributions being combined, i.e. it dominates the result.
    this.spotLimitedBySun = Number.isFinite(rawWidth) && this.solarBlur > rawWidth;
    this.floorIsSolar = this.spotLimitedBySun;
    this.detectorLimited = Number.isFinite(blurredWidth) && blurredWidth < PROFILE_BIN_MM;

    // --- Irradiance profile, by ray-tube deposition ---------------------------
    const widthM = p.outOfPlaneWidth * 1e-3;
    this.profileIsRadial = revolved;
    this.profileAxis = axisY;
    const bins = buildIrradianceProfile(hits, {
      radial: revolved,
      axisY,
      yHalf: m.yHalf,
      widthM
    });
    this.profile = bins;

    let peak = 0;
    for (const b of bins) if (b.irradiance > peak) peak = b.irradiance;
    this.peakIrradiance = peak;
    this.peakConcentration = p.irradiance > 0 ? peak / p.irradiance : 0;

    /* --- Mean irradiance over the hot region ------------------------------
       By construction the 50 %-power region contains exactly half the power
       that reaches the screen. Dividing that by its area gives the mean
       irradiance over the patch that matters, which is more robust than a
       single peak bin and is the quantity the thermal model needs. */
    if (Number.isFinite(this.spotWidth) && this.spotWidth > 0 && delivered > 0) {
      this.spotArea = revolved
        ? Math.PI * Math.pow(this.spotWidth * 0.5 * 1e-3, 2)
        : this.spotWidth * 1e-3 * widthM;
      this.spotPower = 0.5 * delivered;
      this.targetIrradiance = this.spotArea > 0 ? this.spotPower / this.spotArea : 0;
    } else {
      this.spotArea = 0;
      this.spotPower = 0;
      this.targetIrradiance = 0;
    }

    this.concentration = p.irradiance > 0 ? this.targetIrradiance / p.irradiance : 0;
    // Solar absorption uses alphaSolar, not epsilonThermal — see the note
    // above HeatingModel for why the two are kept separate.
    this.absorbedPower = p.alphaSolar * this.targetIrradiance * this.spotArea;
  }

  /* ---- Where the launched power ends up ----------------------------------- */

  /**
   * A full power budget, not just a ray count. Every ray's launched power is
   * split into exactly the buckets below, so they sum to the total launched
   * power to numerical precision — verified in the test suite for both
   * throughput modes. Fresnel reflection loss and Beer–Lambert liquid
   * absorption are tracked as SEPARATE channels (both reduce `ray.power`
   * multiplicatively, but they are physically distinct and the UI reports
   * them separately), and the optional branch-recovery figure is reported on
   * the side rather than folded into the 100% bar, since it is drawn FROM the
   * Fresnel-loss bucket rather than being additional power.
   */
  fateBreakdown() {
    const m = this.model;
    const total = m.launchedPower || 1;

    let reflectedFresnel = 0;  // lost to Fresnel reflection along the way
    let absorbedLiquid = 0;    // lost to Beer–Lambert absorption in the liquid
    let focused = 0;           // entered the bottle and reached the screen
    let background = 0;        // missed the bottle entirely but still reached it
    let tir = 0;                // suffered total internal reflection
    let lost = 0;               // escaped the field of view or exceeded the budget
    let branchRecovered = 0;    // power reflected sub-rays deliver to the target

    for (const ray of m.rays) {
      const launched = m.launchedPower * ray.fraction;
      const t = ray.trace;

      const afterFresnel = launched * t.fresnelThroughput;
      const afterAbsorption = launched * t.fresnelThroughput * t.absorptionThroughput; // === ray.power
      reflectedFresnel += launched - afterFresnel;
      absorbedLiquid += afterFresnel - afterAbsorption;
      branchRecovered += launched * (t.branchPower || 0);

      if (t.tir) tir += ray.power;
      else if (t.status === 'hit') {
        if (t.entered) focused += ray.power;
        else background += ray.power;
      } else lost += ray.power;
    }

    this.fate = [
      { key: 'focused', label: 'Focused onto the screen', power: focused, color: PALETTE.gold },
      { key: 'background', label: 'Missed the bottle', power: background, color: '#5f6b7d' },
      { key: 'tir', label: 'Total internal reflection', power: tir, color: PALETTE.violet },
      { key: 'lost', label: 'Escaped the field', power: lost, color: '#3d4654' },
      { key: 'reflected', label: 'Fresnel reflection loss', power: reflectedFresnel, color: PALETTE.blue },
      { key: 'absorbed', label: 'Absorbed in the liquid (Beer–Lambert)', power: absorbedLiquid, color: PALETTE.green }
    ].map((f) => ({ ...f, fraction: f.power / total }));

    this.branchRecoveredPower = branchRecovered;
    this.branchRecoveredFraction = branchRecovered / total;
    // Physical bound: recovered power is a further-attenuated PORTION of what
    // left the primary path as Fresnel reflection, so it can never exceed it.
    this.branchRecoveredOfReflected = reflectedFresnel > 0 ? branchRecovered / reflectedFresnel : 0;
  }
}

/* ----------------------------------------------------------------------------
   Ray-tube irradiance profile
   ----------------------------------------------------------------------------
   Counting rays per bin is the obvious way to estimate irradiance and it is
   wrong wherever the rays are sparser than the bins: away from focus the
   spacing at the screen easily exceeds half a millimetre, and a straight count
   then produces a comb of alternating empty and full bins — pure aliasing that
   no amount of smoothing repairs honestly.

   Instead each ray is treated as a narrow TUBE whose width is set by the
   spacing to its neighbours at the screen, and its power is spread across the
   bins that tube covers. Where rays bunch together the tube narrows and the
   irradiance rises on its own; where they fan out it widens and the profile
   stays flat at exactly the unconcentrated value. This is the standard
   geometric-optics density estimate, and it needs no smoothing kernel.

   The tube is floored at one bin: a caustic makes the true tube width vanish
   and the geometric irradiance diverge, so the reported peak is explicitly a
   resolution-limited estimate rather than a physical value.
   -------------------------------------------------------------------------- */

/** Sorted, positive-power samples along one coordinate. */
function toSamples(hits, coordOf) {
  return hits
    .filter((h) => h.p > 0)
    .map((h) => ({ c: coordOf(h), p: h.p }))
    .sort((a, b) => a.c - b.c);
}

/**
 * One-dimensional Voronoi tiling of the samples: each ray owns the ground
 * halfway to each neighbour. The tubes therefore cover the illuminated region
 * exactly once — no gaps, no overlap — whatever the local spacing does, and
 * the two outermost samples own only their inner half. Both the irradiance
 * profile and the spot-width metrics are built from this same tiling, so they
 * cannot disagree with each other.
 */
function buildTiles(samples) {
  const n = samples.length;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    tiles.push({
      lo: i === 0 ? samples[0].c : 0.5 * (samples[i - 1].c + samples[i].c),
      hi: i === n - 1 ? samples[n - 1].c : 0.5 * (samples[i].c + samples[i + 1].c),
      c: samples[i].c,
      p: samples[i].p
    });
  }
  return tiles;
}

/** Cumulative power at each tile boundary. Tiles are contiguous, so the edge
 *  list is monotone and the distribution is piecewise linear between edges. */
function tileCdf(tiles) {
  const edges = [tiles[0].lo];
  const cumulative = [0];
  let running = 0;
  for (const t of tiles) {
    running += t.p;
    edges.push(t.hi);
    cumulative.push(running);
  }
  return { edges, cumulative, total: running };
}

function cdfAt(edges, cumulative, position) {
  if (position <= edges[0]) return 0;
  const last = edges.length - 1;
  if (position >= edges[last]) return cumulative[last];
  for (let i = 0; i < last; i++) {
    if (position <= edges[i + 1]) {
      const span = edges[i + 1] - edges[i];
      if (span <= 0) return cumulative[i + 1];
      const f = (position - edges[i]) / span;
      return lerp(cumulative[i], cumulative[i + 1], f);
    }
  }
  return cumulative[last];
}

function invCdf(edges, cumulative, target) {
  const last = cumulative.length - 1;
  if (target <= 0) return edges[0];
  if (target >= cumulative[last]) return edges[last];
  for (let i = 0; i < last; i++) {
    if (target <= cumulative[i + 1]) {
      const span = cumulative[i + 1] - cumulative[i];
      if (span <= 0) return edges[i];          // a zero-width tile: CDF jumps
      const f = (target - cumulative[i]) / span;
      return lerp(edges[i], edges[i + 1], f);
    }
  }
  return edges[last];
}

/** Spread `power` over [lo, hi] into fixed bins, by length or by annulus area. */
function depositRange(power, bins, nBins, binLo, binW, lo, hi, radial) {
  if (radial) lo = Math.max(0, lo);
  const denom = radial ? hi * hi - lo * lo : hi - lo;

  if (!(denom > 0)) {
    const i = Math.floor((lo - binLo) / binW);
    if (i >= 0 && i < nBins) bins[i] += power;
    return;
  }

  const first = Math.max(0, Math.floor((lo - binLo) / binW));
  const last = Math.min(nBins - 1, Math.floor((hi - binLo) / binW));
  for (let i = first; i <= last; i++) {
    const a = Math.max(lo, binLo + i * binW);
    const b = Math.min(hi, binLo + (i + 1) * binW);
    if (b <= a) continue;
    const weight = radial ? (b * b - a * a) / denom : (b - a) / denom;
    bins[i] += power * weight;
  }
}

function emptyProfile(nBins, binLo) {
  const out = [];
  for (let i = 0; i < nBins; i++) {
    out.push({ coord: binLo + (i + 0.5) * PROFILE_BIN_MM, irradiance: 0 });
  }
  return out;
}

function buildIrradianceProfile(hits, options) {
  const { radial, axisY, yHalf, widthM } = options;

  const samples = toSamples(hits, (h) => (radial ? Math.abs(h.y - axisY) : h.y));

  const binLo = radial ? 0 : -yHalf;
  const extent = radial ? yHalf : 2 * yHalf;
  const nBins = Math.max(4, Math.ceil(extent / PROFILE_BIN_MM));
  const power = new Float64Array(nBins);
  if (!samples.length) return emptyProfile(nBins, binLo);

  for (const tile of buildTiles(samples)) {
    let { lo, hi } = tile;

    // A tube narrower than a cell cannot be resolved: at a caustic the true
    // width goes to zero and the geometric irradiance diverges.
    if (hi - lo < PROFILE_BIN_MM) {
      lo = tile.c - PROFILE_BIN_MM / 2;
      hi = tile.c + PROFILE_BIN_MM / 2;
    }

    depositRange(tile.p, power, nBins, binLo, PROFILE_BIN_MM, lo, hi, radial);
  }

  const out = [];
  for (let i = 0; i < nBins; i++) {
    let area;
    if (radial) {
      const rIn = i * PROFILE_BIN_MM * 1e-3;
      const rOut = (i + 1) * PROFILE_BIN_MM * 1e-3;
      area = Math.PI * (rOut * rOut - rIn * rIn);
    } else {
      area = PROFILE_BIN_MM * 1e-3 * widthM;
    }
    out.push({
      coord: binLo + (i + 0.5) * PROFILE_BIN_MM,
      irradiance: power[i] / area
    });
  }
  return out;
}

/* ============================================================================
   8 · HEATING MODEL
   ----------------------------------------------------------------------------
   One node, one temperature. The governing balance for a patch of area A is

       C·A·dT/dt = α_solar E A − h A (T − T0) − ε_thermal σ A (T⁴ − T0⁴)

   and because every term carries the same A, the area divides straight out:

       C·dT/dt = α_solar E − h (T − T0) − ε_thermal σ (T⁴ − T0⁴)

   WITHIN THIS LUMPED, ONE-NODE MODEL, that cancellation means the steady
   temperature depends on the LOCAL IRRADIANCE at the target, not on the total
   power collected — a bottle that gathers a lot of light but smears it over a
   wide patch heats that patch no more than an unconcentrated patch would. That
   is a real and useful statement, but it is scoped to this model's
   assumptions: it says nothing about whether a physically bigger apparatus is
   easier or harder to build, aim, or hold in focus, and it ignores lateral
   conduction, convection driven by the target's actual size and orientation,
   and the fact that a larger aperture collects a finite-Sun image that is
   itself larger (see the finite-Sun note in OpticalAnalyzer.targetProfile).
   "Size doesn't matter" is a statement about this equation, not a general
   claim about real bottles.

   ---- alpha_solar vs epsilon_thermal: two different numbers -----------------
   Kirchhoff's law of thermal radiation states that at a given WAVELENGTH,
   DIRECTION, and POLARISATION, and for a surface in local thermal equilibrium,
   spectral absorptivity equals spectral emissivity: α(λ) = ε(λ). It does NOT
   say that a material's absorptivity for sunlight equals its emissivity for
   its own thermal radiation, because those two processes sit in completely
   different spectral bands. Incoming sunlight is thermal radiation from a
   ~5778 K source, peaking (Wien's law) around 500 nm — visible light. The
   target's own thermal emission at a few hundred kelvin peaks in the mid
   infrared, several micrometres. A surface's spectral α(λ)/ε(λ) curve can differ
   enormously between those two bands: this is precisely how a selective solar
   absorber works, engineered to have high α in the visible (soaks up sunlight)
   and low ε in the infrared (radiates poorly, so it does not immediately give
   the heat back). Treating "the absorptivity" as one number that serves both
   roles would misrepresent exactly the surfaces for which the distinction
   matters most, so this model exposes them as independent parameters,
   alphaSolar and epsilonThermal, both defaulting to 0.9 (a plausible grey
   value for an ordinary dark, non-selective surface) but freely adjustable
   apart.

   Including the radiative term is not optional in practice regardless of which
   value ε_thermal takes: at 750 K a surface with ε_thermal = 0.9 radiates
   roughly 18 kW/m², comparable with the entire concentrated input, and
   dropping the term inflates the predicted temperature into fantasy.
   ========================================================================== */

class HeatingModel {
  constructor(params) {
    this.reset(params);
  }

  reset(params) {
    this.temperature = params.ambient;
    this.time = 0;
    this.history = [{ t: 0, T: params.ambient }];
    this.running = false;
  }

  /**
   * dT/dt in K/s, with T in °C.
   * P_abs uses alphaSolar (the target's absorptivity for the incoming solar
   * spectrum); P_rad uses epsilonThermal (its emissivity for its own
   * few-hundred-kelvin thermal radiation) — see the note above this class for
   * why those are not the same number in general.
   */
  derivative(T, irradiance, p) {
    const convection = p.loss * (T - p.ambient);
    let radiation = 0;
    if (p.radiative) {
      const Tk = T + T0_K;
      const T0k = p.ambient + T0_K;
      radiation = p.epsilonThermal * SIGMA * (Tk * Tk * Tk * Tk - T0k * T0k * T0k * T0k);
    }
    return (p.alphaSolar * irradiance - convection - radiation) / Math.max(1e-6, p.capacity);
  }

  /**
   * Step size from the local thermal time constant. The linearised radiative
   * conductance is 4ε_thermal σT³, which at high temperature dwarfs the
   * convective term and would destabilise a naive fixed step; taking a fixed
   * fraction of C/(h + 4ε_thermal σT³) keeps explicit RK4 comfortably stable
   * throughout.
   */
  stableStep(T, p) {
    const Tk = T + T0_K;
    const radiativeConductance = p.radiative ? 4 * p.epsilonThermal * SIGMA * Tk * Tk * Tk : 0;
    const tau = p.capacity / Math.max(1e-6, p.loss + radiativeConductance);
    return clamp(0.15 * tau, 1e-4, 0.25);
  }

  /** Advance by `dt` seconds of SIMULATED time using classical RK4. */
  advance(dt, irradiance, p) {
    let remaining = Math.min(dt, 5);
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 20000) {
      const h = Math.min(remaining, this.stableStep(this.temperature, p));
      const T = this.temperature;

      const k1 = this.derivative(T, irradiance, p);
      const k2 = this.derivative(T + 0.5 * h * k1, irradiance, p);
      const k3 = this.derivative(T + 0.5 * h * k2, irradiance, p);
      const k4 = this.derivative(T + h * k3, irradiance, p);

      this.temperature = T + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      this.time += h;
      remaining -= h;
    }

    // Keep the history at a manageable resolution for plotting.
    const last = this.history[this.history.length - 1];
    if (this.time - last.t > p.duration / 400) {
      this.history.push({ t: this.time, T: this.temperature });
    }
  }

  /** Integrate from ambient for `seconds`, without touching live state. */
  static integrate(seconds, irradiance, p) {
    const model = new HeatingModel(p);
    let elapsed = 0;
    let guard = 0;
    while (elapsed < seconds && guard++ < 200000) {
      const h = Math.min(model.stableStep(model.temperature, p), seconds - elapsed);
      const T = model.temperature;
      const k1 = model.derivative(T, irradiance, p);
      const k2 = model.derivative(T + 0.5 * h * k1, irradiance, p);
      const k3 = model.derivative(T + 0.5 * h * k2, irradiance, p);
      const k4 = model.derivative(T + h * k3, irradiance, p);
      model.temperature = T + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      elapsed += h;
    }
    return model.temperature;
  }
}

/**
 * Paraxial focal distance for each dispersion band.
 *
 * The colour fringe in the ray diagram is around one per cent wide and is
 * therefore close to invisible at any sensible zoom — which is itself the
 * honest answer for this problem. Quoting the three focal distances says the
 * same thing in a form that can actually be read. A deliberately narrow beam
 * is used so the number is the paraxial chromatic spread, uncontaminated by
 * the much larger spherical aberration.
 */
function chromaticFoci(params) {
  return DISPERSION.map((band) => {
    const probe = {
      ...params,
      nWall: params.nWall + band.dWall,
      nLiquid: params.nLiquid + band.dLiquid,
      beamDiameter: Math.min(params.beamDiameter, 6),
      rayCount: 21,
      dispersion: false,
      fresnel: false
    };
    const analysis = new OpticalAnalyzer(new BottleLensModel(probe));
    return { key: band.key, focus: analysis.paraxialFocus };
  });
}

/**
 * Qualitative label for the concentration achieved. Deliberately describes the
 * MODEL's behaviour rather than making a claim about the world: nothing here
 * says anything will ignite.
 */
function concentrationStatus(concentration, temperature) {
  if (!Number.isFinite(concentration) || concentration < 3) {
    return { level: 0, text: 'Diffuse illumination' };
  }
  if (concentration < 15) return { level: 1, text: 'Visible concentration' };
  if (concentration < 60) return { level: 2, text: 'Strong concentration' };
  const hot = Number.isFinite(temperature) && temperature > 200;
  return { level: 3, text: hot ? 'Model predicts rapid heating' : 'Model predicts strong heating' };
}

/* ============================================================================
   9 · RENDERER — the main ray diagram
   Pure drawing. Reads the model and analysis, writes pixels, keeps no state
   beyond the view transform and the star field.
   ========================================================================== */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = this.makeStars(90);
    this.view = { scale: 1, ox: 0, oy: 0 };
  }

  makeStars(count) {
    const random = makeRandom(1337);
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({ x: random(), y: random(), r: random() * 0.8 + 0.25, a: random() * 0.3 + 0.06 });
    }
    return stars;
  }

  syncSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const tw = Math.round(w * dpr);
    const th = Math.round(h * dpr);
    if (this.canvas.width !== tw || this.canvas.height !== th) {
      this.canvas.width = tw;
      this.canvas.height = th;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  /** World (mm, y up) → screen (px, y down). */
  computeView(model, w, h) {
    const box = model.box;
    const spanX = box.xMax - box.xMin;
    const spanY = box.yMax - box.yMin;
    const scale = Math.min(w / spanX, h / spanY) * 0.95;
    const cx = (box.xMin + box.xMax) / 2;
    this.view = { scale, ox: w / 2 - cx * scale, oy: h / 2 };
    return this.view;
  }

  sx(x) { return this.view.ox + x * this.view.scale; }
  sy(y) { return this.view.oy - y * this.view.scale; }

  /** Screen x → world x, used by the target-plane drag. */
  worldX(px) { return (px - this.view.ox) / this.view.scale; }

  draw(model, analysis, heat) {
    const { w, h } = this.syncSize();
    const ctx = this.ctx;
    this.computeView(model, w, h);

    this.drawBackground(ctx, w, h);
    if (model.p.debug) this.drawRegionGrid(ctx, model);
    if (model.p.showAxis) this.drawAxis(ctx, model, w);
    this.drawBottle(ctx, model);
    if (model.p.showRays) this.drawRays(ctx, model);
    if (model.p.branching) this.drawBranches(ctx, model);
    if (model.p.showNormals || model.p.debug) this.drawNormals(ctx, model);
    if (model.p.debug) this.drawEventLabels(ctx, model);
    this.drawFocus(ctx, model, analysis);
    this.drawTarget(ctx, model, analysis, heat);
    this.drawScaleBar(ctx, w, h);
  }

  /** Debug mode: tint every region of the field by which medium occupies it,
   *  sampled on a coarse world-space grid via the same classifyRegion() the
   *  analysis code would use — not a separate, potentially-inconsistent
   *  reimplementation. Air is left transparent so the background stays legible. */
  drawRegionGrid(ctx, model) {
    const geom = model.geom;
    const box = model.box;
    const cols = 110;
    const rows = 56;
    const dx = (box.xMax - box.xMin) / cols;
    const dy = (box.yMax - box.yMin) / rows;
    const colors = {
      wall: 'rgba(159, 180, 204, 0.16)',
      liquid: 'rgba(111, 210, 232, 0.17)',
      head: 'rgba(244, 239, 229, 0.11)'
    };

    ctx.save();
    for (let iy = 0; iy < rows; iy++) {
      const wyTop = box.yMax - iy * dy;
      const wyMid = wyTop - dy * 0.5;
      for (let ix = 0; ix < cols; ix++) {
        const wxLeft = box.xMin + ix * dx;
        const region = classifyRegion(geom, { x: wxLeft + dx * 0.5, y: wyMid });
        const color = colors[region];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          this.sx(wxLeft), this.sy(wyTop),
          dx * this.view.scale + 0.6, dy * this.view.scale + 0.6
        );
      }
    }
    ctx.restore();
  }

  /** Debug mode: draw the (usually invisible) Fresnel-reflected sub-rays that
   *  branching mode traces, in a colour distinct from the primary path. */
  drawBranches(ctx, model) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(155, 107, 255, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([1, 2]);
    for (const ray of model.rays) {
      const branches = ray.trace.branchSegments;
      if (!branches) continue;
      for (const branch of branches) {
        for (const seg of branch.segments) {
          ctx.beginPath();
          ctx.moveTo(this.sx(seg.a.x), this.sy(seg.a.y));
          ctx.lineTo(this.sx(seg.b.x), this.sy(seg.b.y));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** Debug mode: label each interface event (which medium ratio, transmitted
   *  fraction or TIR) on a thinned subset of rays, using the SAME event log
   *  `trace()` recorded — not inferred after the fact from the drawing. */
  drawEventLabels(ctx, model) {
    const stride = Math.max(1, Math.round(model.rays.length / 9));
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(244, 239, 229, 0.8)';
    ctx.textAlign = 'left';
    for (let r = 0; r < model.rays.length; r += stride) {
      const events = model.rays[r].trace.events || [];
      for (const ev of events) {
        ctx.fillText(ev.label, this.sx(ev.point.x) + 3, this.sy(ev.point.y) - 3);
      }
    }
    ctx.restore();
  }

  drawBackground(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#080d18');
    grad.addColorStop(0.55, '#070b14');
    grad.addColorStop(1, '#0a1020');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    for (const s of this.stars) {
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawAxis(ctx, model, w) {
    const u = model.axisDirection();
    const far = 4000;
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(this.sx(-far * u.x), this.sy(-far * u.y));
    ctx.lineTo(this.sx(far * u.x), this.sy(far * u.y));
    ctx.stroke();
    ctx.restore();
  }

  tracePath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(this.sx(points[0].x), this.sy(points[0].y));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(this.sx(points[i].x), this.sy(points[i].y));
    }
    ctx.closePath();
  }

  drawBottle(ctx, model) {
    const geom = model.geom;

    // Wall: outer path with the inner path punched out (even-odd).
    ctx.save();
    ctx.beginPath();
    this.tracePath(ctx, geom.outerPath);
    this.tracePath(ctx, geom.innerPath);
    ctx.fillStyle = 'rgba(160, 190, 215, 0.20)';
    ctx.fill('evenodd');
    ctx.restore();

    // Liquid, with opacity rising modestly with fill so a part-full bottle
    // reads as part-full at a glance.
    const liquid = geom.liquidPath();
    if (liquid.length > 2) {
      const alpha = 0.13 + 0.14 * geom.fillFraction;
      ctx.save();
      this.tracePath(ctx, liquid);
      ctx.fillStyle = `rgba(90, 175, 215, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(131, 184, 215, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Outlines.
    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(200, 224, 240, 0.75)';
    this.tracePath(ctx, geom.outerPath);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(200, 224, 240, 0.35)';
    this.tracePath(ctx, geom.innerPath);
    ctx.stroke();
    ctx.restore();

    // The free surface is a refracting interface, so it is drawn as one.
    if (geom.freeSurface) {
      ctx.save();
      ctx.strokeStyle = 'rgba(131, 184, 215, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.sx(geom.freeSurface.p.x), this.sy(geom.freeSurface.p.y));
      ctx.lineTo(this.sx(geom.freeSurface.q.x), this.sy(geom.freeSurface.q.y));
      ctx.stroke();
      ctx.restore();
    }
  }

  drawRays(ctx, model) {
    const n = model.rays.length;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    const alpha = clamp(0.85 - n * 0.004, 0.28, 0.8);

    if (model.dispersionRays) {
      /* Additive blending is the physically correct way to superpose three
         colours of light: where the bundles coincide they add back to white,
         and only where they separate does a fringe appear. At an honest Δn
         that separation is of order one per cent, so the bundle is thinned
         first — sixty overlapping rays per band saturate the whole fan to
         white and hide the very thing being illustrated. The numeric focal
         spread in the metrics panel is what actually quantifies this. */
      const stride = Math.max(1, Math.round(model.dispersionRays[0].traces.length / 15));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.1;
      for (const band of model.dispersionRays) {
        ctx.strokeStyle = band.color;
        for (let i = 0; i < band.traces.length; i += stride) {
          for (const seg of band.traces[i].segments) {
            ctx.beginPath();
            ctx.moveTo(this.sx(seg.a.x), this.sy(seg.a.y));
            ctx.lineTo(this.sx(seg.b.x), this.sy(seg.b.y));
            ctx.stroke();
          }
        }
      }
    } else {
      // Additive blending so overlapping rays brighten: the caustic then
      // appears on its own, from ray density, with no special-case drawing.
      ctx.globalCompositeOperation = 'lighter';
      for (const ray of model.rays) {
        const t = ray.trace;
        for (const seg of t.segments) {
          let color;
          let a = alpha;
          if (seg.tir) color = RAY_COLORS.tir;
          else if (!t.entered) { color = RAY_COLORS.missed; a = alpha * 0.42; }
          else color = RAY_COLORS[seg.region] || RAY_COLORS.exit;

          ctx.strokeStyle = color;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(this.sx(seg.a.x), this.sy(seg.a.y));
          ctx.lineTo(this.sx(seg.b.x), this.sy(seg.b.y));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  drawNormals(ctx, model) {
    const geom = model.geom;
    const len = Math.max(6, geom.a * 0.28);
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.55)';
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2, 3]);

    // A tick at every interface of every ray is a solid band of hatching that
    // teaches nothing. Thin to about a dozen rays so individual normals stay
    // readable as normals.
    const stride = Math.max(1, Math.round(model.rays.length / 12));

    for (let r = 0; r < model.rays.length; r += stride) {
      const ray = model.rays[r];
      const segs = ray.trace.segments;
      // Interior vertices are the refraction points; the last one is a
      // termination, not an interface, so it is skipped.
      for (let i = 0; i < segs.length - 1; i++) {
        const point = segs[i].b;
        const normal = this.normalAtPoint(geom, point);
        if (!normal) continue;
        ctx.beginPath();
        ctx.moveTo(this.sx(point.x - normal.x * len * 0.5), this.sy(point.y - normal.y * len * 0.5));
        ctx.lineTo(this.sx(point.x + normal.x * len * 0.5), this.sy(point.y + normal.y * len * 0.5));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Nearest surface normal at a known interface point, for the overlay. */
  normalAtPoint(geom, point) {
    let best = null;
    let bestDist = Infinity;
    for (const s of geom.surfaces) {
      let dist;
      let normal;
      if (s.kind === 'arc') {
        const d = Math.hypot(point.x - s.c.x, point.y - s.c.y);
        dist = Math.abs(d - s.r);
        normal = { x: (point.x - s.c.x) / (d || 1), y: (point.y - s.c.y) / (d || 1) };
      } else {
        dist = Math.abs(Vec2.dot(Vec2.sub(point, s.p), s.n));
        normal = s.n;
      }
      if (dist < bestDist) { bestDist = dist; best = normal; }
    }
    return bestDist < 0.05 ? best : null;
  }

  drawFocus(ctx, model, analysis) {
    if (!analysis || !Number.isFinite(analysis.bestFocusGap)) return;
    const u = model.axisDirection();
    const centre = Vec2.along(model.rearVertex, u, analysis.bestFocusGap);
    const strength = clamp(Math.log10(Math.max(1, analysis.peakConcentration)) / 2.6, 0, 1);
    if (strength <= 0.02) return;

    const radius = Math.max(10, 26 * this.view.scale * 0.35);
    const grad = ctx.createRadialGradient(
      this.sx(centre.x), this.sy(centre.y), 0,
      this.sx(centre.x), this.sy(centre.y), radius
    );
    grad.addColorStop(0, `rgba(255, 236, 190, ${0.55 * strength})`);
    grad.addColorStop(0.35, `rgba(242, 160, 73, ${0.22 * strength})`);
    grad.addColorStop(1, 'rgba(242, 160, 73, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.sx(centre.x), this.sy(centre.y), radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawTarget(ctx, model, analysis, heat) {
    const x = this.sx(model.targetX);
    const yTop = this.sy(model.yHalf);
    const yBot = this.sy(-model.yHalf);

    // The screen itself.
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();

    // Heat overlay: paint the strip with the local concentration.
    if (analysis && analysis.profile && analysis.profile.length) {
      const E0 = Math.max(1e-9, model.p.irradiance);
      const axisY = analysis.profileAxis;
      const stripW = 7;
      for (const bin of analysis.profile) {
        const c = bin.irradiance / E0;
        if (c < 0.05) continue;
        const yWorld = analysis.profileIsRadial ? axisY + bin.coord : bin.coord;
        const draw = (yw) => {
          const py = this.sy(yw);
          const ph = Math.max(1.2, PROFILE_BIN_MM * this.view.scale);
          ctx.fillStyle = heatColor(c);
          ctx.fillRect(x, py - ph / 2, stripW, ph);
        };
        draw(yWorld);
        if (analysis.profileIsRadial && bin.coord > 0) draw(axisY - bin.coord);
      }
    }

    // Caption.
    ctx.fillStyle = 'rgba(244, 239, 229, 0.65)';
    ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    const label = `target  ${fmt(model.p.targetGap, 0)} mm`;
    ctx.fillText(label, x + 11, yTop + 16);
    if (analysis && Number.isFinite(analysis.concentration)) {
      ctx.fillStyle = 'rgba(215, 180, 112, 0.85)';
      ctx.fillText(`×${fmt(analysis.concentration, 1)}`, x + 11, yTop + 31);
    }
    if (heat && heat.running) {
      ctx.fillStyle = 'rgba(214, 140, 112, 0.9)';
      ctx.fillText(`${fmt(heat.temperature, 0)} °C`, x + 11, yTop + 46);
    }
    ctx.restore();
  }

  drawScaleBar(ctx, w, h) {
    const mm = 20;
    const px = mm * this.view.scale;
    if (px < 12 || px > w * 0.5) return;
    const x = 18;
    const y = h - 18;
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.4)';
    ctx.fillStyle = 'rgba(244, 239, 229, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.moveTo(x, y - 3.5);
    ctx.lineTo(x, y + 3.5);
    ctx.moveTo(x + px, y - 3.5);
    ctx.lineTo(x + px, y + 3.5);
    ctx.stroke();
    ctx.font = '500 10px "DM Sans", system-ui, sans-serif';
    ctx.fillText(`${mm} mm`, x + px + 7, y + 3.5);
    ctx.restore();
  }
}

/** Concentration → colour ramp: dim rust, through gold, to white-hot. */
function heatColor(concentration) {
  const t = clamp(Math.log10(Math.max(1, concentration)) / 2.4, 0, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgba(${Math.round(lerp(120, 232, k))}, ${Math.round(lerp(60, 150, k))}, ${Math.round(lerp(50, 70, k))}, ${lerp(0.45, 0.9, k)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgba(${Math.round(lerp(232, 255, k))}, ${Math.round(lerp(150, 246, k))}, ${Math.round(lerp(70, 225, k))}, ${lerp(0.9, 1, k)})`;
}

/* ============================================================================
   10 · SMALL PLOT RENDERER
   A minimal charting layer: axes, ticks, one or more series, and a hover
   crosshair with a live readout. Deliberately hand-written — no dependencies.
   ========================================================================== */

class SmallPlot {
  constructor(canvas, readoutEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readout = readoutEl;
    this.spec = null;
    this.hover = null;

    canvas.addEventListener('pointermove', (e) => this.onHover(e));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      if (this.readout && this.spec) this.readout.textContent = this.spec.idleText || '';
      this.render();
    });
  }

  setSpec(spec) {
    this.spec = spec;
    this.hover = null;
    if (this.readout) this.readout.textContent = spec.idleText || '';
    this.render();
  }

  syncSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const tw = Math.round(w * dpr);
    const th = Math.round(h * dpr);
    if (this.canvas.width !== tw || this.canvas.height !== th) {
      this.canvas.width = tw;
      this.canvas.height = th;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  onHover(event) {
    if (!this.spec || !this.spec.series.length) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hover = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.render();
  }

  render() {
    const spec = this.spec;
    const { w, h } = this.syncSize();
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);
    if (!spec) return;

    const pad = { l: 52, r: 14, t: 12, b: 30 };
    const pw = Math.max(10, w - pad.l - pad.r);
    const ph = Math.max(10, h - pad.t - pad.b);

    const [x0, x1] = spec.xRange;
    const [y0, y1] = spec.yRange;
    const spanX = (x1 - x0) || 1;
    const spanY = (y1 - y0) || 1;
    const px = (x) => pad.l + ((x - x0) / spanX) * pw;
    const py = (y) => pad.t + ph - ((y - y0) / spanY) * ph;

    // --- grid and axes
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 239, 229, 0.09)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(172, 180, 197, 0.75)';
    ctx.font = '500 9px "JetBrains Mono", ui-monospace, monospace';

    // One precision per axis, chosen from the tick spacing — mixing decimal
    // counts down a single axis reads as noise rather than as data.
    const ticks = 4;
    const fmtY = tickFormatter(y0, y1, ticks);
    const fmtX = tickFormatter(x0, x1, ticks);

    for (let i = 0; i <= ticks; i++) {
      const yv = lerp(y0, y1, i / ticks);
      const y = py(yv);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(fmtY(yv), pad.l - 7, y + 3);
    }
    for (let i = 0; i <= ticks; i++) {
      const xv = lerp(x0, x1, i / ticks);
      const x = px(xv);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmtX(xv), x, pad.t + ph + 15);
    }

    // Axis labels.
    ctx.fillStyle = 'rgba(172, 180, 197, 0.9)';
    ctx.font = '600 9px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (spec.xLabel) ctx.fillText(spec.xLabel, pad.l + pw / 2, h - 3);
    if (spec.yLabel) {
      ctx.save();
      ctx.translate(11, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(spec.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // --- reference lines
    for (const line of spec.hLines || []) {
      if (line.y < y0 || line.y > y1) continue;
      ctx.save();
      ctx.strokeStyle = line.color || 'rgba(244, 239, 229, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, py(line.y));
      ctx.lineTo(pad.l + pw, py(line.y));
      ctx.stroke();
      if (line.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = line.color || 'rgba(244, 239, 229, 0.45)';
        ctx.font = '500 9px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(line.label, pad.l + 5, py(line.y) - 4);
      }
      ctx.restore();
    }
    for (const line of spec.vLines || []) {
      if (line.x < x0 || line.x > x1) continue;
      ctx.save();
      ctx.strokeStyle = line.color || 'rgba(244, 239, 229, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px(line.x), pad.t);
      ctx.lineTo(px(line.x), pad.t + ph);
      ctx.stroke();
      ctx.restore();
    }

    // --- series
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();

    for (const s of spec.series) {
      if (!s.points || !s.points.length) continue;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width || 1.4;

      if (s.type === 'scatter') {
        for (const pt of s.points) {
          ctx.beginPath();
          ctx.arc(px(pt.x), py(pt.y), s.radius || 2, 0, TAU);
          ctx.fill();
        }
      } else if (s.type === 'area') {
        ctx.beginPath();
        ctx.moveTo(px(s.points[0].x), py(Math.max(y0, 0)));
        for (const pt of s.points) ctx.lineTo(px(pt.x), py(pt.y));
        ctx.lineTo(px(s.points[s.points.length - 1].x), py(Math.max(y0, 0)));
        ctx.closePath();
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let i = 0; i < s.points.length; i++) {
          const pt = s.points[i];
          if (i === 0) ctx.moveTo(px(pt.x), py(pt.y));
          else ctx.lineTo(px(pt.x), py(pt.y));
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (let i = 0; i < s.points.length; i++) {
          const pt = s.points[i];
          if (i === 0) ctx.moveTo(px(pt.x), py(pt.y));
          else ctx.lineTo(px(pt.x), py(pt.y));
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // --- hover crosshair and readout
    if (this.hover && spec.series[0] && spec.series[0].points.length) {
      const dataX = x0 + ((this.hover.x - pad.l) / pw) * spanX;
      const pts = spec.series[0].points;
      let nearest = pts[0];
      let bestDist = Infinity;
      for (const pt of pts) {
        const d = Math.abs(pt.x - dataX);
        if (d < bestDist) { bestDist = d; nearest = pt; }
      }
      const hx = px(nearest.x);
      const hy = py(nearest.y);
      if (hx >= pad.l - 1 && hx <= pad.l + pw + 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(244, 239, 229, 0.3)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, pad.t);
        ctx.lineTo(hx, pad.t + ph);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(hx, clamp(hy, pad.t, pad.t + ph), 3, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (this.readout && spec.format) {
          this.readout.textContent = spec.format(nearest);
        }
      }
    }

    // --- empty-state message
    if (spec.empty) {
      ctx.save();
      ctx.fillStyle = 'rgba(172, 180, 197, 0.55)';
      ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(spec.empty, pad.l + pw / 2, pad.t + ph / 2);
      ctx.restore();
    }
  }
}

/** Fixed decimal count for a whole axis, derived from its tick spacing. */
function tickFormatter(lo, hi, ticks) {
  const step = Math.abs(hi - lo) / Math.max(1, ticks);
  let decimals = 0;
  if (step < 0.005) decimals = 4;
  else if (step < 0.05) decimals = 3;
  else if (step < 0.5) decimals = 2;
  else if (step < 5) decimals = 1;
  return (value) => (Object.is(value, -0) ? 0 : value).toFixed(decimals);
}

/* ============================================================================
   11 · PARAMETER SWEEP
   Rebuilds the entire model across a range of one parameter. Cheap enough to
   run synchronously — a full trace is a few thousand intersection tests — but
   the UI still paints a "Computing…" state first so a slow machine never looks
   frozen.
   ========================================================================== */

const SWEEP_X = {
  nLiquid: {
    label: 'Liquid refractive index',
    unit: '',
    range: (p) => [1.0, 1.6],
    apply: (p, v) => { p.nLiquid = v; }
  },
  capRadius: {
    label: 'Cap radius (both ends)',
    unit: 'mm',
    range: (p) => [Math.max(20, p.diameter / 2), 300],
    apply: (p, v) => { p.radiusLeft = v; p.radiusRight = v; }
  },
  wall: {
    label: 'Wall thickness',
    unit: 'mm',
    range: (p) => [0.2, 8],
    apply: (p, v) => { p.wallThickness = v; }
  },
  beam: {
    label: 'Beam diameter',
    unit: 'mm',
    range: () => [5, 140],
    apply: (p, v) => { p.beamDiameter = v; }
  }
};

const SWEEP_Y = {
  focal: {
    label: 'Paraxial focal distance',
    unit: 'mm',
    extract: (a) => a.paraxialFocus
  },
  spot: {
    label: 'Focal-spot width (50 % power)',
    unit: 'mm',
    extract: (a) => a.spotWidth
  },
  conc: {
    label: 'Concentration factor',
    unit: '×',
    extract: (a) => a.concentration
  },
  temp: {
    label: 'Final target temperature',
    unit: '°C',
    extract: (a, p) => HeatingModel.integrate(p.duration, a.targetIrradiance, p)
  }
};

function runSweep(baseParams, xKey, yKey, samples = 32) {
  const xDef = SWEEP_X[xKey];
  const yDef = SWEEP_Y[yKey];
  const [lo, hi] = xDef.range(baseParams);
  const points = [];

  for (let i = 0; i < samples; i++) {
    const v = lerp(lo, hi, samples > 1 ? i / (samples - 1) : 0);
    const params = { ...baseParams };
    xDef.apply(params, v);

    // A cap radius below the bottle radius is geometrically impossible; the
    // geometry clamps it and would otherwise produce a flat, misleading run of
    // identical samples, so those points are simply not plotted.
    if (xKey === 'capRadius' && v < params.diameter / 2 - 1e-9) continue;

    try {
      const model = new BottleLensModel(params);
      const analysis = new OpticalAnalyzer(model);
      const y = yDef.extract(analysis, params);
      if (Number.isFinite(y)) points.push({ x: v, y });
    } catch (err) {
      // A sweep sample must never take the page down with it.
      console.warn('sweep sample failed', v, err);
    }
  }
  return { points, xDef, yDef };
}

/* ============================================================================
   12 · IN-BROWSER SELF-TESTS
   ----------------------------------------------------------------------------
   A concise regression suite that runs the SHIPPED code — the exact classes
   and functions the page itself uses, not a reimplementation — against known
   closed-form results. This is deliberately small (a dozen or so checks) so
   it can run on every load without being noticed; the much larger suite this
   was developed against lives outside the shipped page (a Node harness that
   loads this file and drives it with a stub DOM), and exercises hundreds of
   cases across the same functions. What is here is enough to catch a broken
   build at a glance, rendered into the "Developer validation" drawer.
   ========================================================================== */

function runSelfTests() {
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || '' });
  const near = (name, actual, expected, tol, unit = '') => {
    const diff = Math.abs(actual - expected);
    record(name, diff <= tol, `got ${actual.toFixed(4)}${unit}, expected ${expected.toFixed(4)}${unit} (Δ ${diff.toExponential(2)})`);
  };
  const baseParams = () => ({ ...DEFAULTS });

  // 1 · Snell's law identity across a single planar interface, air → n=1.5.
  try {
    const n = { x: -1, y: 0 };
    let worst = 0;
    for (let deg = 1; deg <= 80; deg++) {
      const th1 = (deg * Math.PI) / 180;
      const d = { x: Math.cos(th1), y: Math.sin(th1) };
      const r = refract(d, n, 1.0 / 1.5);
      const th2 = Math.atan2(r.dir.y, r.dir.x);
      worst = Math.max(worst, Math.abs(1.0 * Math.sin(th1) - 1.5 * Math.sin(th2)));
    }
    near('Snell identity, 1°–80°, air→1.5', worst, 0, 1e-9);
  } catch (e) { record('Snell identity, 1°–80°, air→1.5', false, String(e)); }

  // 2 · Critical-angle TIR boundary, dense → rare (n1=1.5 → n2=1.0).
  try {
    const critical = Math.asin(1.0 / 1.5);
    const n = { x: -1, y: 0 };
    const at = (th) => refract({ x: Math.cos(th), y: Math.sin(th) }, n, 1.5 / 1.0);
    const survives = at(critical - 1e-6) !== null;
    const tir = at(critical + 1e-6) === null;
    record('Critical angle: transmits just inside, TIR just outside', survives && tir);
  } catch (e) { record('Critical angle TIR boundary', false, String(e)); }

  // 3 · Planar slab: parallel exit and the standard lateral-displacement formula.
  try {
    const thickness = 10;
    const nGlass = 1.5;
    const theta1 = 35 * Math.PI / 180;
    const d0 = { x: Math.cos(theta1), y: Math.sin(theta1) };
    const nrm = { x: -1, y: 0 };
    const r1 = refract(d0, nrm, 1.0 / nGlass);
    const theta2 = Math.acos(clamp(r1.dir.x, -1, 1));
    const xAtExit = thickness / r1.dir.x;
    // Point where the ray actually leaves the slab, launched from the origin.
    const exitPoint = Vec2.along({ x: 0, y: 0 }, r1.dir, xAtExit);
    const r2 = refract(r1.dir, nrm, nGlass / 1.0);
    const parallel = Math.abs(r2.dir.x - d0.x) < 1e-9 && Math.abs(r2.dir.y - d0.y) < 1e-9;
    // Lateral displacement is the PERPENDICULAR distance from the actual exit
    // point to the line the incident ray would have followed with no slab at
    // all — not the raw y-coordinate, which mixes in how far the ray already
    // travelled along its own direction. Cross product of (exit − origin)
    // with the incident direction gives exactly that perpendicular distance.
    const perpDistance = Math.abs(exitPoint.x * d0.y - exitPoint.y * d0.x);
    const expectedShift = thickness * Math.sin(theta1 - theta2) / Math.cos(theta2);
    near('Slab lateral shift matches closed form', perpDistance, expectedShift, 1e-9, ' mm');
    record('Slab exit ray is parallel to the incident ray', parallel);
  } catch (e) { record('Planar slab (shift + parallel exit)', false, String(e)); }

  // 4 · Index-matched interface: no bend, no loss.
  try {
    const d = Vec2.normalize({ x: 1, y: 0.4 });
    const n = { x: -1, y: 0 };
    const r = refract(d, n, 1.0);
    const T = fresnelTransmittance(1.333, 1.333, -Vec2.dot(d, n), -Vec2.dot(d, n));
    record('Index-matched interface: direction unchanged', Math.hypot(r.dir.x - d.x, r.dir.y - d.y) < 1e-12);
    near('Index-matched interface: T = 1', T, 1, 1e-12);
  } catch (e) { record('Index-matched interface', false, String(e)); }

  // 5 · Ball-lens back focal distance (wall index = liquid index → a solid sphere).
  try {
    const R = 35, n = 1.45;
    const model = new BottleLensModel({
      ...baseParams(), bodyLength: 0, radiusLeft: R, radiusRight: R, diameter: 2 * R,
      wallThickness: 1.0, nWall: n, nLiquid: n, beamDiameter: 1.2, rayCount: 21, fresnel: false
    });
    const a = new OpticalAnalyzer(model);
    const expected = R * (2 - n) / (2 * (n - 1));
    near('Ball-lens BFD (paraxial, n=1.45)', a.paraxialFocus, expected, expected * 0.01, ' mm');
  } catch (e) { record('Ball-lens BFD', false, String(e)); }

  // 6 · Thick-lens BFD formula, general R1 ≠ R2.
  try {
    const R1 = 60, R2 = 90, L = 80, n = 1.4;
    const model = new BottleLensModel({
      ...baseParams(), radiusLeft: R1, radiusRight: R2, bodyLength: L, diameter: 60,
      wallThickness: 0.8, nWall: n, nLiquid: n, beamDiameter: 1.2, rayCount: 21, fresnel: false
    });
    const a = new OpticalAnalyzer(model);
    const d = model.geom.axialThickness;
    const invF = (n - 1) * (1 / R1 - 1 / (-R2) + ((n - 1) * d) / (n * R1 * (-R2)));
    const f = 1 / invF;
    const bfd = f * (1 - ((n - 1) * d) / (n * R1));
    near('Thick-lens BFD, R1≠R2', a.paraxialFocus, bfd, Math.abs(bfd) * 0.02, ' mm');
  } catch (e) { record('Thick-lens BFD, R1≠R2', false, String(e)); }

  // 7 · Half-filled, tilted bottle: the free surface is a finite horizontal
  //     segment clipped to the interior.
  try {
    const geom = new BottleGeometry({ ...baseParams(), fillFraction: 0.5, tiltDeg: 11 });
    const fs = geom.freeSurface;
    const horizontal = Math.abs(fs.p.y - fs.q.y) < 1e-9;
    const finiteAndOrdered = Number.isFinite(fs.p.x) && Number.isFinite(fs.q.x) && fs.q.x > fs.p.x;
    const insideCavity = geom.insideInner({ x: (fs.p.x + fs.q.x) / 2, y: fs.p.y });
    record('Tilted half-fill: free surface horizontal, finite, in the cavity', horizontal && finiteAndOrdered && insideCavity);
  } catch (e) { record('Tilted half-fill free surface', false, String(e)); }

  // 8 · Energy conservation, Fresnel-weighted mode: the power budget sums to
  //     the launched power.
  try {
    const model = new BottleLensModel({ ...baseParams(), fresnel: true, rayCount: 41 });
    const a = new OpticalAnalyzer(model);
    const sum = a.fate.reduce((s, f) => s + f.fraction, 0);
    near('Power budget sums to launched power (Fresnel mode)', sum, 1, 1e-9);
  } catch (e) { record('Power budget conservation', false, String(e)); }

  // 9 · Energy conservation, Fresnel + Beer–Lambert + branching all on.
  try {
    const model = new BottleLensModel({
      ...baseParams(), fresnel: true, branching: true, liquidAttenuation: 8, rayCount: 31
    });
    const a = new OpticalAnalyzer(model);
    const sum = a.fate.reduce((s, f) => s + f.fraction, 0);
    near('Power budget sums to launched power (branching + absorption)', sum, 1, 1e-9);
    record('Branch-recovered power cannot exceed the Fresnel loss it is drawn from',
      a.branchRecoveredOfReflected <= 1 + 1e-9,
      `recovered/reflected = ${(a.branchRecoveredOfReflected * 100).toFixed(2)}%`);
  } catch (e) { record('Power budget with branching + absorption', false, String(e)); }

  // 10 · Beer–Lambert actually attenuates: more liquid path, less throughput.
  try {
    const short = new BottleLensModel({ ...baseParams(), fresnel: true, liquidAttenuation: 30, bodyLength: 20, rayCount: 9 });
    const long = new BottleLensModel({ ...baseParams(), fresnel: true, liquidAttenuation: 30, bodyLength: 200, rayCount: 9 });
    const centreThroughput = (m) => m.rays.find((r) => Math.abs(r.height) < 1e-6).trace.absorptionThroughput;
    record('Longer liquid path absorbs more (Beer–Lambert)', centreThroughput(long) < centreThroughput(short));
  } catch (e) { record('Beer–Lambert monotonicity', false, String(e)); }

  // 11 · Kirchhoff correction: alphaSolar and epsilonThermal act independently.
  try {
    const base = { ...baseParams(), radiative: true, capacity: 150, loss: 25, ambient: 20, alphaSolar: 0.9, epsilonThermal: 0.9 };
    const T0 = HeatingModel.integrate(600, 20000, base);
    const TalphaUp = HeatingModel.integrate(600, 20000, { ...base, alphaSolar: 0.5 });
    const TepsUp = HeatingModel.integrate(600, 20000, { ...base, epsilonThermal: 0.5 });
    record('alphaSolar and epsilonThermal move the steady temperature independently',
      Math.abs(TalphaUp - T0) > 1 && Math.abs(TepsUp - T0) > 1 && Math.abs(TalphaUp - TepsUp) > 1,
      `T(base)=${T0.toFixed(1)}, T(α=0.5)=${TalphaUp.toFixed(1)}, T(ε=0.5)=${TepsUp.toFixed(1)}`);
  } catch (e) { record('alphaSolar/epsilonThermal independence', false, String(e)); }

  // 12 · Local-irradiance invariance WITHIN the lumped model: at fixed
  //      irradiance, the steady temperature does not depend on patch area
  //      (the model-scoped claim — see the note above HeatingModel).
  try {
    const p = { ...baseParams(), radiative: true };
    const a = HeatingModel.integrate(600, 20000, p);
    const b = HeatingModel.integrate(600, 20000, p);
    near('Steady temperature depends on irradiance, not on patch area (model-scoped)', a, b, 1e-9, ' °C');
  } catch (e) { record('Area-invariance of the lumped thermal model', false, String(e)); }

  // 13 · Finite-Sun quadrature: when the traced spot is far tighter than the
  //      solar blur, the reported (blurred) width is dominated by the blur.
  try {
    const model = new BottleLensModel({
      ...baseParams(), bodyLength: 0, radiusLeft: 35, radiusRight: 35, nLiquid: 1.52, nWall: 1.52,
      beamDiameter: 3, rayCount: 41, targetGap: 16
    });
    const a = new OpticalAnalyzer(model);
    near('Finite-Sun blur dominates a near-perfect focus (quadrature limit)',
      a.blurredSpotWidth, a.solarBlur, a.solarBlur * 0.05, ' mm');
  } catch (e) { record('Finite-Sun quadrature limit', false, String(e)); }

  // 14 · No NaNs across a small but deliberately awkward geometry/optics sweep.
  try {
    let bad = 0, traced = 0;
    for (const nLiquid of [1.0, 1.333, 1.6]) {
      for (const tilt of [-12, 0, 12]) {
        const model = new BottleLensModel({
          ...baseParams(), nLiquid, tiltDeg: tilt, fillFraction: 0.4, rayCount: 15, fresnel: true, branching: true, liquidAttenuation: 5
        });
        for (const ray of model.rays) {
          traced++;
          if (!Number.isFinite(ray.trace.throughput) || ray.trace.throughput < 0) bad++;
          for (const seg of ray.trace.segments) {
            if (!Number.isFinite(seg.a.x) || !Number.isFinite(seg.b.x)) bad++;
          }
        }
      }
    }
    record(`No NaN/negative throughput across ${traced} rays (awkward sweep)`, bad === 0, `bad = ${bad}`);
  } catch (e) { record('NaN robustness sweep', false, String(e)); }

  const passed = results.filter((r) => r.pass).length;
  return { results, passed, total: results.length };
}

/* ============================================================================
   13 · UI CONTROLLER
   All DOM access lives here. Everything above is pure computation.
   ========================================================================== */

/** Slider descriptors: id → parameter key, plus how to show the value. */
const SLIDERS = [
  { id: 'in-radius-left', key: 'radiusLeft', out: 'val-radius-left', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-radius-right', key: 'radiusRight', out: 'val-radius-right', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-body', key: 'bodyLength', out: 'val-body', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-diameter', key: 'diameter', out: 'val-diameter', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-wall', key: 'wallThickness', out: 'val-wall', fmt: (v) => `${v.toFixed(1)} mm` },
  { id: 'in-fill', key: 'fillFraction', out: 'val-fill', fmt: (v) => `${(v * 100).toFixed(0)} %`, scale: 0.01 },
  { id: 'in-tilt', key: 'tiltDeg', out: 'val-tilt', fmt: (v) => `${v.toFixed(1)}°` },

  { id: 'in-n-wall', key: 'nWall', out: 'val-n-wall', fmt: (v) => v.toFixed(3) },
  { id: 'in-n-liquid', key: 'nLiquid', out: 'val-n-liquid', fmt: (v) => v.toFixed(3) },
  { id: 'in-rays', key: 'rayCount', out: 'val-rays', fmt: (v) => `${v.toFixed(0)}` },
  { id: 'in-beam', key: 'beamDiameter', out: 'val-beam', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-incidence', key: 'incidenceDeg', out: 'val-incidence', fmt: (v) => `${v.toFixed(1)}°` },
  { id: 'in-liquid-mu', key: 'liquidAttenuation', out: 'val-liquid-mu', fmt: (v) => `${v.toFixed(1)} m⁻¹` },

  { id: 'in-target', key: 'targetGap', out: 'val-target', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-irradiance', key: 'irradiance', out: 'val-irradiance', fmt: (v) => `${v.toFixed(0)} W/m²` },
  { id: 'in-width', key: 'outOfPlaneWidth', out: 'val-width', fmt: (v) => `${v.toFixed(0)} mm` },
  { id: 'in-alpha-solar', key: 'alphaSolar', out: 'val-alpha-solar', fmt: (v) => v.toFixed(2) },
  { id: 'in-epsilon-thermal', key: 'epsilonThermal', out: 'val-epsilon-thermal', fmt: (v) => v.toFixed(2) },
  { id: 'in-capacity', key: 'capacity', out: 'val-capacity', fmt: (v) => `${v.toFixed(0)} J/m²K` },
  { id: 'in-loss', key: 'loss', out: 'val-loss', fmt: (v) => `${v.toFixed(0)} W/m²K` },
  { id: 'in-ambient', key: 'ambient', out: 'val-ambient', fmt: (v) => `${v.toFixed(0)} °C` },
  { id: 'in-duration', key: 'duration', out: 'val-duration', fmt: (v) => `${v.toFixed(0)} s` },
  { id: 'in-timescale', key: 'timeScale', out: 'val-timescale', fmt: (v) => `${v.toFixed(0)}×` }
];

const TOGGLES = [
  { id: 'tg-rays', key: 'showRays' },
  { id: 'tg-paraxial', key: 'paraxialOnly' },
  { id: 'tg-normals', key: 'showNormals' },
  { id: 'tg-axis', key: 'showAxis' },
  { id: 'tg-fresnel', key: 'fresnel' },
  { id: 'tg-branching', key: 'branching' },
  { id: 'tg-dispersion', key: 'dispersion' },
  { id: 'tg-radiative', key: 'radiative' },
  { id: 'tg-debug', key: 'debug' }
];

/** Complete parameter sets for the scenario buttons. */
const PRESETS = {
  'water-normal': {},
  'water-tilted': { tiltDeg: 9, incidenceDeg: 4, fillFraction: 0.8 },
  'high-index': { nLiquid: 1.55, beamDiameter: 46, targetGap: 34 },
  empty: { fillFraction: 0, beamDiameter: 60, targetGap: 120 },
  sphere: {
    bodyLength: 0,
    radiusLeft: 35,
    radiusRight: 35,
    diameter: 70,
    wallThickness: 1.5,
    nLiquid: 1.52,
    nWall: 1.52,
    beamDiameter: 44,
    targetGap: 14,
    mode: MODE.REVOLVED
  }
};

class UIController {
  constructor() {
    this.params = { ...DEFAULTS };
    this.el = {};
    this.cacheElements();

    this.renderer = new Renderer(this.el.canvas);
    this.heat = new HeatingModel(this.params);

    this.plotProfile = new SmallPlot(this.el.plotProfile, this.el.readoutProfile);
    this.plotFocal = new SmallPlot(this.el.plotFocal, this.el.readoutFocal);
    this.plotTemp = new SmallPlot(this.el.plotTemp, this.el.readoutTemp);
    this.plotSweep = new SmallPlot(this.el.plotSweep, this.el.readoutSweep);

    this.pendingRefresh = 0;
    this.dragging = false;

    this.bindControls();
    this.bindButtons();
    this.bindCanvas();

    this.writeParamsToDom();
    this.refresh();
    this.startLoop();

    // Populate the sweep panel straight away rather than leaving an empty
    // rectangle that looks like a feature waiting to be built.
    this.doSweep();
    this.runValidation();
  }

  cacheElements() {
    const id = (x) => document.getElementById(x);
    this.el = {
      canvas: id('lens-canvas'),
      validation: id('validation'),
      sanity: id('sanity-list'),
      metricFocal: id('m-focal'),
      metricFocalSub: id('m-focal-sub'),
      metricSpot: id('m-spot'),
      metricConc: id('m-conc'),
      metricConcSub: id('m-conc-sub'),
      metricPower: id('m-power'),
      metricPowerSub: id('m-power-sub'),
      metricTemp: id('m-temp'),
      metricTempSub: id('m-temp-sub'),
      metricStatus: id('m-status'),
      plotProfile: id('plot-profile'),
      plotFocal: id('plot-focal'),
      plotTemp: id('plot-temp'),
      plotSweep: id('plot-sweep'),
      readoutProfile: id('readout-profile'),
      readoutFocal: id('readout-focal'),
      readoutTemp: id('readout-temp'),
      readoutSweep: id('readout-sweep'),
      fateBar: id('fate-bar'),
      fateLegend: id('fate-legend'),
      fateNote: id('fate-note'),
      devList: id('dev-validation-list'),
      devSummary: id('dev-validation-summary'),
      devRun: id('btn-run-validation'),
      heatStart: id('btn-heat-start'),
      heatReset: id('btn-heat-reset'),
      heatClock: id('heat-clock'),
      sweepX: id('sel-sweep-x'),
      sweepY: id('sel-sweep-y'),
      sweepRun: id('btn-sweep-run'),
      sweepStatus: id('sweep-status'),
      mode: id('sel-mode'),
      binNote: id('bin-note')
    };
    if (this.el.binNote) this.el.binNote.textContent = `${PROFILE_BIN_MM} mm`;
  }

  /* ---- Parameter plumbing ------------------------------------------------- */

  bindControls() {
    for (const s of SLIDERS) {
      const input = document.getElementById(s.id);
      if (!input) continue;
      s.input = input;
      input.addEventListener('input', () => {
        const raw = parseFloat(input.value);
        this.params[s.key] = s.scale ? raw * s.scale : raw;
        this.updateSliderLabel(s);
        this.scheduleRefresh();
      });
    }

    for (const t of TOGGLES) {
      const input = document.getElementById(t.id);
      if (!input) continue;
      t.input = input;
      input.addEventListener('change', () => {
        this.params[t.key] = input.checked;
        this.scheduleRefresh();
      });
    }

    this.el.mode.addEventListener('change', () => {
      this.params.mode = this.el.mode.value;
      this.scheduleRefresh();
    });

    for (const btn of document.querySelectorAll('[data-liquid]')) {
      btn.addEventListener('click', () => {
        this.params.nLiquid = parseFloat(btn.dataset.liquid);
        this.writeParamsToDom();
        this.scheduleRefresh();
      });
    }
  }

  updateSliderLabel(s) {
    const out = document.getElementById(s.out);
    if (out) out.textContent = s.fmt(this.params[s.key]);
  }

  writeParamsToDom() {
    for (const s of SLIDERS) {
      if (!s.input) continue;
      const value = s.scale ? this.params[s.key] / s.scale : this.params[s.key];
      s.input.value = String(value);
      // Read back: the browser snaps to the slider's step and range, and the
      // parameters must agree with what is actually displayed.
      const snapped = parseFloat(s.input.value);
      this.params[s.key] = s.scale ? snapped * s.scale : snapped;
      this.updateSliderLabel(s);
    }
    for (const t of TOGGLES) {
      if (t.input) t.input.checked = !!this.params[t.key];
    }
    this.el.mode.value = this.params.mode;

    for (const btn of document.querySelectorAll('[data-liquid]')) {
      const active = Math.abs(parseFloat(btn.dataset.liquid) - this.params.nLiquid) < 1e-6;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  bindButtons() {
    for (const btn of document.querySelectorAll('[data-preset]')) {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
    }

    document.getElementById('btn-reset-all').addEventListener('click', () => {
      this.params = { ...DEFAULTS };
      this.writeParamsToDom();
      this.resetHeating();
      this.refresh();
    });

    document.getElementById('btn-random').addEventListener('click', () => this.randomize());

    document.getElementById('btn-autofocus').addEventListener('click', () => {
      if (this.analysis && Number.isFinite(this.analysis.bestFocusGap)) {
        this.params.targetGap = Math.round(this.analysis.bestFocusGap);
        this.writeParamsToDom();
        this.refresh();
      }
    });

    this.el.heatStart.addEventListener('click', () => {
      this.heat.running = !this.heat.running;
      if (this.heat.running && this.heat.time >= this.params.duration) this.resetHeating(true);
      this.updateHeatButton();
    });

    this.el.heatReset.addEventListener('click', () => this.resetHeating());

    this.el.sweepRun.addEventListener('click', () => this.doSweep());

    if (this.el.devRun) this.el.devRun.addEventListener('click', () => this.runValidation());

    for (const btn of document.querySelectorAll('[data-sweep]')) {
      btn.addEventListener('click', () => {
        const [x, y] = btn.dataset.sweep.split('|');
        this.el.sweepX.value = x;
        this.el.sweepY.value = y;
        document.getElementById('section-analysis').scrollIntoView({ behavior: 'smooth' });
        // Let the scroll begin before the synchronous sweep blocks the thread.
        setTimeout(() => this.doSweep(), 350);
      });
    }
  }

  applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    this.params = { ...DEFAULTS, ...preset };
    this.writeParamsToDom();
    this.resetHeating();
    this.refresh();
  }

  /** Bounded random setup — always plausible, never degenerate. */
  randomize() {
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    const diameter = Math.round(rand(50, 95));
    const capMin = diameter / 2;

    this.params = {
      ...this.params,
      diameter,
      radiusLeft: Math.round(rand(capMin, Math.min(160, capMin * 3.2))),
      radiusRight: Math.round(rand(capMin, Math.min(160, capMin * 3.2))),
      bodyLength: Math.round(rand(40, 200)),
      wallThickness: Math.round(rand(0.5, 4) * 10) / 10,
      fillFraction: Math.round(rand(0.55, 1) * 100) / 100,
      tiltDeg: Math.round(rand(-6, 6) * 2) / 2,
      nLiquid: Math.round(rand(1.31, 1.5) * 200) / 200,
      nWall: Math.round(rand(1.42, 1.58) * 200) / 200,
      beamDiameter: Math.round(diameter * rand(0.5, 0.95)),
      incidenceDeg: Math.round(rand(-4, 4) * 2) / 2
    };
    this.writeParamsToDom();
    this.refresh();

    // Put the screen somewhere useful rather than somewhere random.
    if (this.analysis && Number.isFinite(this.analysis.bestFocusGap)) {
      this.params.targetGap = clamp(Math.round(this.analysis.bestFocusGap), 2, 320);
      this.writeParamsToDom();
      this.refresh();
    }
    this.resetHeating();
  }

  /* ---- Canvas interaction ------------------------------------------------- */

  bindCanvas() {
    const canvas = this.el.canvas;

    const setFromEvent = (event) => {
      if (!this.model) return;
      const rect = canvas.getBoundingClientRect();
      const worldX = this.renderer.worldX(event.clientX - rect.left);
      const gap = clamp(Math.round(worldX - this.model.rearVertex.x), 2, 320);
      if (gap !== this.params.targetGap) {
        this.params.targetGap = gap;
        this.writeParamsToDom();
        this.scheduleRefresh();
      }
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (!this.model) return;
      const rect = canvas.getBoundingClientRect();
      const worldX = this.renderer.worldX(event.clientX - rect.left);
      // Only grab downstream of the bottle — dragging over the bottle itself
      // would make the geometry feel accidentally draggable.
      if (worldX < this.model.rearVertex.x) return;
      this.dragging = true;
      canvas.setPointerCapture(event.pointerId);
      setFromEvent(event);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (this.dragging) setFromEvent(event);
    });

    const release = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  /* ---- Refresh cycle ------------------------------------------------------ */

  scheduleRefresh() {
    if (this.pendingRefresh) return;
    this.pendingRefresh = requestAnimationFrame(() => {
      this.pendingRefresh = 0;
      this.refresh();
    });
  }

  refresh() {
    this.model = new BottleLensModel(this.params);
    this.analysis = new OpticalAnalyzer(this.model);

    this.updateValidation();
    this.updateMetrics();
    this.updateSanity();
    this.updateProfilePlot();
    this.updateFocalPlot();
    this.updateFatePlot();
    this.updateTempPlot();
  }

  updateValidation() {
    const warnings = this.model.geom.warnings;
    const el = this.el.validation;
    if (!warnings.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = warnings.map((w) => `<span>${w}</span>`).join('');
  }

  updateMetrics() {
    const a = this.analysis;
    const p = this.params;

    this.el.metricFocal.textContent = Number.isFinite(a.paraxialFocus)
      ? `${fmt(a.paraxialFocus, 1)} mm`
      : 'diverging';
    if (p.dispersion) {
      const bands = chromaticFoci(p);
      const values = bands.map((b) => b.focus).filter(Number.isFinite);
      const spread = values.length ? Math.max(...values) - Math.min(...values) : NaN;
      this.el.metricFocalSub.textContent = values.length
        ? `R ${fmt(bands[0].focus, 1)} · G ${fmt(bands[1].focus, 1)} · B ${fmt(bands[2].focus, 1)} mm (Δ ${fmt(spread, 2)})`
        : 'no axis crossing downstream';
    } else {
      this.el.metricFocalSub.textContent = Number.isFinite(a.longitudinalAberration)
        ? `LSA ${fmt(a.longitudinalAberration, 1)} mm · best focus ${fmt(a.bestFocusGap, 0)} mm`
        : 'no axis crossing downstream';
    }

    this.el.metricSpot.textContent = Number.isFinite(a.spotWidth)
      ? `${fmt(a.spotWidth, 2)} mm`
      : '—';

    this.el.metricConc.textContent = Number.isFinite(a.concentration)
      ? `×${fmt(a.concentration, 1)}`
      : '—';
    this.el.metricConcSub.textContent =
      `peak ×${fmt(a.peakConcentration, 1)} · ${p.mode === MODE.REVOLVED ? 'revolved (idealized bound)' : 'extruded (idealized bound)'}`;

    this.el.metricPower.textContent = fmtPower(a.absorbedPower);
    this.el.metricPowerSub.textContent = a.spotArea > 0
      ? `patch ${fmt(a.spotArea * 1e6, 1)} mm² · ${fmt(a.reachFraction * 100, 0)} % of rays land`
      : 'no power reaching the screen';

    this.el.metricTemp.textContent = `${fmt(this.heat.temperature, 1)} °C`;
    this.el.metricTempSub.textContent = this.heat.running
      ? `running · t = ${fmt(this.heat.time, 1)} s`
      : (this.heat.time > 0 ? `paused at t = ${fmt(this.heat.time, 1)} s` : 'heating paused');

    const status = concentrationStatus(a.concentration, this.heat.temperature);
    this.el.metricStatus.textContent = status.text;
    this.el.metricStatus.dataset.level = String(status.level);
  }

  updateSanity() {
    const a = this.analysis;
    const p = this.params;
    const items = [];

    // --- indices
    if (p.nLiquid <= 1.005) {
      items.push({ state: 'warn', text: '<b>Liquid index ≈ air.</b> The bottle has almost no lens action; what remains comes from the two wall menisci alone.' });
    } else if (Math.abs(p.nLiquid - p.nWall) < 0.02) {
      items.push({ state: 'info', text: '<b>Liquid matches the wall.</b> The two inner surfaces are optically invisible, so the bottle behaves as one solid element.' });
    } else if (p.nLiquid > p.nWall) {
      items.push({ state: 'info', text: '<b>Liquid denser than the wall.</b> The wall→liquid interface now bends rays the other way, and total internal reflection becomes possible on the way out.' });
    } else {
      items.push({ state: 'ok', text: `<b>Indices are physically ordered:</b> air 1.000 &lt; liquid ${p.nLiquid.toFixed(3)} &lt; wall ${p.nWall.toFixed(3)}.` });
    }

    // --- convergence
    if (!a.converging || !Number.isFinite(a.paraxialFocus)) {
      items.push({ state: 'warn', text: '<b>The bundle is not converging</b> downstream of the bottle — no useful focus exists for these parameters.' });
    } else {
      const ratio = Math.abs(a.longitudinalAberration) / Math.max(1e-6, a.paraxialFocus);
      if (ratio > 0.2) {
        items.push({ state: 'warn', text: `<b>Strongly aberrated.</b> Marginal rays cross the axis ${fmt(Math.abs(a.longitudinalAberration), 1)} mm from the paraxial focus — ${fmt(ratio * 100, 0)} % of the focal distance. Narrow the beam to see the paraxial limit.` });
      } else if (ratio > 0.04) {
        items.push({ state: 'info', text: `<b>Moderate spherical aberration:</b> ${fmt(ratio * 100, 1)} % longitudinal spread across the aperture (${fmt(Math.abs(a.longitudinalAberration), 1)} mm).` });
      } else {
        items.push({ state: 'ok', text: '<b>Nearly stigmatic</b> over this aperture — the crossing height barely varies with ray height.' });
      }
    }

    // --- target placement
    if (Number.isFinite(a.bestFocusGap)) {
      const off = Math.abs(p.targetGap - a.bestFocusGap);
      if (off < Math.max(3, a.bestFocusGap * 0.06)) {
        items.push({ state: 'ok', text: '<b>Target is at the tightest spot</b> the traced bundle can produce.' });
      } else {
        items.push({ state: 'info', text: `<b>Target is ${fmt(off, 0)} mm from best focus</b> (${fmt(a.bestFocusGap, 0)} mm). Snap it there to compare geometries fairly.` });
      }
    }

    // --- delivery
    const pct = a.reachFraction * 100;
    items.push({
      state: pct > 85 ? 'ok' : pct > 50 ? 'info' : 'warn',
      text: `<b>${fmt(pct, 0)} % of rays reach the screen.</b> The rest escape the field of view, hit the barrel, or are turned back by total internal reflection.`
    });

    // --- finite-Sun blur, combined in quadrature with the traced spot
    if (a.spotLimitedBySun) {
      const dims = a.blurDimensions === 2 ? 'both transverse dimensions (revolved)' : 'the focused dimension only (cylindrical — the out-of-plane width is untouched)';
      items.push({
        state: 'info',
        text: `<b>Dominated by the Sun's finite size.</b> The traced rays converge to ${fmt(a.rawSpotWidth, 3)} mm, but the Sun's 0.53° angular diameter alone would blur a perfect focus to ${fmt(a.solarBlur, 2)} mm here; combined in quadrature the reported spot is ${fmt(a.blurredSpotWidth, 2)} mm, applied in ${dims}.`
      });
    } else if (a.detectorLimited) {
      items.push({
        state: 'info',
        text: `<b>Spot width floored at the ${fmt(PROFILE_BIN_MM, 1)} mm detector cell.</b> The blurred spot (${fmt(a.blurredSpotWidth, 3)} mm) is finer than this model claims to resolve.`
      });
    }

    // --- mode validity
    if (p.mode === MODE.REVOLVED && (Math.abs(p.tiltDeg) > 0.01 || Math.abs(p.incidenceDeg) > 0.01)) {
      items.push({ state: 'warn', text: '<b>Revolved mode assumes on-axis illumination.</b> With the bottle or the beam tilted, the true three-dimensional spot is not rotationally symmetric and the reported concentration is an over-estimate.' });
    }
    items.push({ state: 'info', text: `<b>Concentration figures are idealized radiometric bounds.</b> ${p.mode === MODE.REVOLVED ? 'Revolving' : 'Extruding'} the traced profile is a modelling choice about the unseen third dimension, not a measurement — treat C<sub>revolved</sub> and C<sub>cylindrical</sub> as the two limiting cases a real bottle sits between, not as a prediction for one specific bottle.` });

    // --- partial fill
    if (p.fillFraction > 0 && p.fillFraction < 1) {
      items.push({ state: 'info', text: `<b>Partially filled (${fmt(p.fillFraction * 100, 0)} %).</b> The horizontal air–liquid surface is traced as a real refracting interface, and it stays level however the bottle is tilted.` });
    }

    // --- geometry
    if (this.model.geom.warnings.length) {
      items.push({ state: 'bad', text: '<b>Geometry was clamped</b> to stay physically constructible — see the notice above the controls.' });
    } else {
      items.push({ state: 'ok', text: `<b>Geometry is valid:</b> axial thickness ${fmt(this.model.geom.axialThickness, 1)} mm, wall ${fmt(this.model.geom.t, 2)} mm, cavity half-height ${fmt(this.model.geom.ai, 1)} mm.` });
    }

    this.el.sanity.innerHTML = items
      .map((i) => `<li data-state="${i.state}"><span class="mark">${markFor(i.state)}</span><span class="text">${i.text}</span></li>`)
      .join('');
  }

  updateProfilePlot() {
    const a = this.analysis;
    const p = this.params;
    const E0 = Math.max(1e-9, p.irradiance);

    if (!a.profile || !a.profile.length) {
      this.plotProfile.setSpec({ series: [], xRange: [-1, 1], yRange: [0, 1], empty: 'No rays reach the screen' });
      return;
    }

    // Mirror the radial profile so the plot reads as a cross-section either way.
    let points;
    if (a.profileIsRadial) {
      const left = a.profile.slice().reverse().map((b) => ({ x: -b.coord, y: b.irradiance / E0 }));
      const right = a.profile.map((b) => ({ x: b.coord, y: b.irradiance / E0 }));
      points = left.concat(right);
    } else {
      const axis = a.profileAxis;
      points = a.profile.map((b) => ({ x: b.coord - axis, y: b.irradiance / E0 }));
    }

    // Window the view around the spot so the interesting millimetres are visible.
    const halfSpan = clamp(
      Number.isFinite(a.spotWidth) ? a.spotWidth * 5 : 20,
      4,
      this.model.yHalf
    );
    const centre = a.profileIsRadial ? 0 : (a.spotCentre - a.profileAxis);

    let peak = 0;
    for (const pt of points) {
      if (Math.abs(pt.x - centre) <= halfSpan && pt.y > peak) peak = pt.y;
    }

    this.plotProfile.setSpec({
      series: [{ type: 'area', points, color: PALETTE.gold, width: 1.3 }],
      xRange: [centre - halfSpan, centre + halfSpan],
      yRange: [0, Math.max(1.4, peak * 1.15)],
      xLabel: a.profileIsRadial ? 'radius from the axis (mm)' : 'height on the screen (mm)',
      yLabel: 'concentration E / E₀',
      hLines: [{ y: 1, color: 'rgba(244, 239, 229, 0.35)', label: 'no bottle' }],
      idleText: `peak ×${fmt(a.peakConcentration, 1)} · 50 % width ${fmt(a.spotWidth, 2)} mm · hover for values`,
      format: (pt) => `${fmt(pt.x, 2)} mm → ×${fmt(pt.y, 2)} = ${fmt(pt.y * E0, 0)} W/m²`
    });
  }

  updateFocalPlot() {
    const a = this.analysis;
    if (!a.crossings.length) {
      this.plotFocal.setSpec({ series: [], xRange: [-1, 1], yRange: [0, 1], empty: 'No rays cross the axis downstream' });
      return;
    }

    const points = a.crossings
      .map((c) => ({ x: c.height, y: c.distance }))
      .sort((u, v) => u.x - v.x);

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const pt of points) {
      if (pt.y < yMin) yMin = pt.y;
      if (pt.y > yMax) yMax = pt.y;
    }
    const pad = Math.max(2, (yMax - yMin) * 0.12);

    this.plotFocal.setSpec({
      series: [
        { type: 'line', points, color: PALETTE.blue, width: 1.3 },
        { type: 'scatter', points, color: PALETTE.blue, radius: 1.8 }
      ],
      xRange: [points[0].x, points[points.length - 1].x],
      yRange: [Math.max(0, yMin - pad), yMax + pad],
      xLabel: 'entry height (mm)',
      yLabel: 'axis crossing (mm)',
      hLines: Number.isFinite(a.paraxialFocus)
        ? [{ y: a.paraxialFocus, color: 'rgba(215, 180, 112, 0.6)', label: 'paraxial' }]
        : [],
      idleText: `paraxial ${fmt(a.paraxialFocus, 1)} mm · marginal ${fmt(a.marginalFocus, 1)} mm · LSA ${fmt(a.longitudinalAberration, 1)} mm`,
      format: (pt) => `entry ${fmt(pt.x, 1)} mm → crosses at ${fmt(pt.y, 1)} mm`
    });
  }

  updateFatePlot() {
    const a = this.analysis;
    const p = this.params;
    const fate = a.fate;
    this.el.fateBar.innerHTML = fate
      .map((f) => `<span style="width:${(clamp(f.fraction, 0, 1) * 100).toFixed(2)}%;background:${f.color}"></span>`)
      .join('');
    this.el.fateLegend.innerHTML = fate
      .map((f) => `<li><i style="--c:${f.color}"></i><span>${f.label}</span><b>${fmt(f.fraction * 100, 1)} %</b></li>`)
      .join('');

    if (!this.el.fateNote) return;
    if (!p.fresnel) {
      this.el.fateNote.textContent =
        'Fast geometric mode: every ray is fully transmitted (throughput ≡ 1), so this budget is trivial — turn on physical throughput to see where the power actually goes.';
    } else if (p.branching) {
      this.el.fateNote.textContent =
        `Branching mode: of the ${fmt(fate.find((f) => f.key === 'reflected').fraction * 100, 1)} % lost to Fresnel reflection above, tracing reflected sub-rays up to depth ${MAX_BRANCH_DEPTH} recovers an extra ${fmt(a.branchRecoveredFraction * 100, 2)} % onto the target (${fmt(a.branchRecoveredOfReflected * 100, 1)} % of that reflected loss). This recovered power is NOT included in the concentration or temperature figures above — it is reported here only, as the approximation's own accounting of what it left out.`;
    } else {
      this.el.fateNote.textContent =
        'Physical throughput mode: Fresnel reflection and any Beer–Lambert liquid absorption are tracked; reflected sub-rays are not traced (turn on branching to recover the small extra contribution they deliver to the target).';
    }
  }

  /* ---- Developer validation drawer ---------------------------------------- */

  runValidation() {
    if (!this.el.devList) return;
    const { results, passed, total } = runSelfTests();
    this.el.devSummary.textContent = `${passed} / ${total} checks passed`;
    this.el.devSummary.dataset.state = passed === total ? 'ok' : 'bad';
    this.el.devList.innerHTML = results
      .map((r) => `<li data-state="${r.pass ? 'ok' : 'bad'}"><span class="mark">${r.pass ? '✓' : '×'}</span><span class="text"><b>${r.name}</b> ${r.detail}</span></li>`)
      .join('');
  }

  updateTempPlot() {
    const history = this.heat.history;
    const p = this.params;
    const points = history.map((h) => ({ x: h.t, y: h.T }));
    if (points.length < 2) points.push({ x: 0.001, y: this.heat.temperature });

    let tMax = -Infinity;
    let tMin = Infinity;
    for (const pt of points) {
      if (pt.y > tMax) tMax = pt.y;
      if (pt.y < tMin) tMin = pt.y;
    }

    this.plotTemp.setSpec({
      series: [{ type: 'area', points, color: PALETTE.rust, width: 1.5 }],
      xRange: [0, Math.max(1, p.duration)],
      yRange: [Math.min(p.ambient - 5, tMin - 5), Math.max(tMax * 1.1, p.ambient + 30)],
      xLabel: 'time (s)',
      yLabel: 'target temperature (°C)',
      hLines: [{ y: p.ambient, color: 'rgba(131, 184, 215, 0.4)', label: 'ambient' }],
      idleText: this.heat.running
        ? `running · ${fmt(this.heat.temperature, 1)} °C at t = ${fmt(this.heat.time, 1)} s`
        : `${fmt(this.heat.temperature, 1)} °C at t = ${fmt(this.heat.time, 1)} s — the simplified model, not a prediction of ignition`,
      format: (pt) => `t = ${fmt(pt.x, 1)} s → ${fmt(pt.y, 1)} °C`
    });
  }

  /* ---- Heating ------------------------------------------------------------ */

  resetHeating(keepRunning = false) {
    const running = keepRunning && this.heat.running;
    this.heat.reset(this.params);
    this.heat.running = running;
    this.updateHeatButton();
    this.updateTempPlot();
    this.updateMetrics();
  }

  updateHeatButton() {
    this.el.heatStart.textContent = this.heat.running ? 'Pause heating' : 'Start heating';
    this.el.heatStart.setAttribute('aria-pressed', this.heat.running ? 'true' : 'false');
  }

  /* ---- Sweep -------------------------------------------------------------- */

  doSweep() {
    const xKey = this.el.sweepX.value;
    const yKey = this.el.sweepY.value;
    this.el.sweepStatus.textContent = 'Computing…';

    // Yield one frame so the status actually paints before the blocking run.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const started = performance.now();
      const { points, xDef, yDef } = runSweep(this.params, xKey, yKey);
      const elapsed = performance.now() - started;

      if (!points.length) {
        this.plotSweep.setSpec({ series: [], xRange: [0, 1], yRange: [0, 1], empty: 'No valid samples in this range' });
        this.el.sweepStatus.textContent = 'No valid samples';
        return;
      }

      let yMin = Infinity;
      let yMax = -Infinity;
      for (const pt of points) {
        if (pt.y < yMin) yMin = pt.y;
        if (pt.y > yMax) yMax = pt.y;
      }
      const pad = Math.max(1e-6, (yMax - yMin) * 0.12);
      // Spot widths, focal distances and concentrations cannot be negative, so
      // padding the axis below zero just invites the reader to wonder what a
      // negative concentration would mean.
      const yLo = yMin >= 0 ? Math.max(0, yMin - pad) : yMin - pad;

      const currentX = {
        nLiquid: this.params.nLiquid,
        capRadius: this.params.radiusLeft,
        wall: this.params.wallThickness,
        beam: this.params.beamDiameter
      }[xKey];

      this.plotSweep.setSpec({
        series: [
          { type: 'line', points, color: PALETTE.gold, width: 1.6 },
          { type: 'scatter', points, color: PALETTE.gold, radius: 2 }
        ],
        xRange: [points[0].x, points[points.length - 1].x],
        yRange: [yLo, yMax + pad],
        xLabel: xDef.unit ? `${xDef.label} (${xDef.unit})` : xDef.label,
        yLabel: yDef.unit ? `${yDef.label} (${yDef.unit})` : yDef.label,
        vLines: [{ x: currentX, color: 'rgba(131, 184, 215, 0.5)' }],
        idleText: `${points.length} samples · blue line marks the current setting · hover for values`,
        format: (pt) => `${fmt(pt.x, 3)} ${xDef.unit} → ${fmt(pt.y, 2)} ${yDef.unit}`
      });

      this.el.sweepStatus.textContent =
        `${points.length} samples in ${elapsed < 1 ? '<1' : elapsed.toFixed(0)} ms`;
    }));
  }

  /* ---- Animation loop ----------------------------------------------------- */

  startLoop() {
    let last = performance.now();

    const frame = (now) => {
      let dt = (now - last) / 1000;
      last = now;
      if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(dt, 0.1);

      if (this.heat.running && this.analysis) {
        const simDt = dt * this.params.timeScale;
        this.heat.advance(simDt, this.analysis.targetIrradiance, this.params);
        if (this.heat.time >= this.params.duration) {
          this.heat.time = this.params.duration;
          this.heat.running = false;
          this.heat.history.push({ t: this.heat.time, T: this.heat.temperature });
          this.updateHeatButton();
        }
        this.updateTempPlot();
        this.updateMetrics();
        this.el.heatClock.textContent = `t = ${fmt(this.heat.time, 1)} s`;
      }

      if (this.model) this.renderer.draw(this.model, this.analysis, this.heat);
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);

    // Re-render the plots on resize; the main canvas redraws every frame anyway.
    window.addEventListener('resize', () => {
      this.plotProfile.render();
      this.plotFocal.render();
      this.plotTemp.render();
      this.plotSweep.render();
    });
  }
}

function markFor(state) {
  if (state === 'ok') return '✓';
  if (state === 'warn') return '!';
  if (state === 'bad') return '×';
  return 'i';
}

/* ============================================================================
   14 · BOOT
   ========================================================================== */

/**
 * Render the theory section's $...$ / $$...$$ LaTeX with KaTeX.
 * KaTeX is loaded from a CDN; if it is unavailable the raw TeX source stays
 * readable (flagged via .katex-missing) rather than the page breaking — the
 * simulation itself has no dependency on the network at all.
 */
function renderMath() {
  if (typeof window.renderMathInElement !== 'function') {
    document.body.classList.add('katex-missing');
    return;
  }
  window.renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false }
    ],
    throwOnError: false
  });
}

function boot() {
  try {
    renderMath();
    window.bottleLab = new UIController();
  } catch (err) {
    console.error('Bottle Lens Laboratory failed to start', err);
    const el = document.getElementById('validation');
    if (el) {
      el.hidden = false;
      el.textContent = `The simulation failed to start: ${err.message}`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
