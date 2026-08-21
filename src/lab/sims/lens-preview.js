// ============================================================
// BOTTLE LENS — CARD PREVIEW
// A miniature of the full instrument at ./thick-lens/, which is
// a standalone page (classic script, no modules) so that it
// opens straight from disk. That independence is deliberate,
// and it is why this small preview restates the optics rather
// than importing them.
//
// Same model as the full page in kind if not in scope: real
// vector Snell refraction across four interfaces, air → wall →
// liquid → wall → air. What it drops is everything the card has
// no room for — tilt, partial fill, total internal reflection,
// Fresnel losses, and all of the radiometry.
//
// The liquid index breathes slowly between 1.30 and 1.48 so the
// focus visibly slides, which is the single relationship the
// card exists to advertise: a lens works through index
// contrast, and more contrast means a shorter focal length.
// ============================================================
import {
  LAB, rgba, syncSize, clearFrame, halo, makeStars, drawStars
} from "../core.js";

// Millimetres, matching the full page's units.
const HALF_HEIGHT = 30;      // bottle radius
const CAP_RADIUS = 46;       // both end caps
const BODY = 90;             // straight barrel
const WALL = 2.5;
const N_WALL = 1.49;
const BEAM = 40;

const RAY_COLORS = {
  incoming: "#f6e7b0",
  wall: "#9fb4cc",
  liquid: "#6fd2e8",
  exit: "#f2a049"
};

export function createLensPreview(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");
  const stars = makeStars(preview ? 16 : 36, 91);

  const rayCount = preview ? 15 : 27;
  let time = 0;
  let nLiquid = 1.4;

  // --- Geometry. A cap of radius R meeting a barrel of half-height a has its
  //     centre inboard of the join by sqrt(R² − a²); the inner surface keeps
  //     the same centre and loses the wall thickness from its radius.
  const inset = Math.sqrt(CAP_RADIUS * CAP_RADIUS - HALF_HEIGHT * HALF_HEIGHT);
  const cL = -BODY / 2 + inset;
  const cR = BODY / 2 - inset;
  const frontX = cL - CAP_RADIUS;
  const rearX = cR + CAP_RADIUS;

  // The four refracting circles, in the order a ray meets them.
  const SURFACES = [
    { cx: cL, r: CAP_RADIUS },
    { cx: cL, r: CAP_RADIUS - WALL },
    { cx: cR, r: CAP_RADIUS - WALL },
    { cx: cR, r: CAP_RADIUS }
  ];

  /**
   * First intersection ahead of the ray.
   * Taking the smallest POSITIVE root covers both cases without a special
   * case: from outside the circle it picks the near surface, and from inside
   * the near root is negative, so it picks the far one.
   */
  function hitCircle(px, py, dx, dy, surface) {
    const ox = px - surface.cx;
    const b = ox * dx + py * dy;
    const c = ox * ox + py * py - surface.r * surface.r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const near = -b - s;
    const t = near > 1e-6 ? near : -b + s;
    if (t <= 1e-6) return null;
    return { t, x: px + dx * t, y: py + dy * t };
  }

  // Vector Snell: t = ηd + (η cosθ₁ − cosθ₂)n, with n oriented against d.
  function refract(dx, dy, nx, ny, eta) {
    const cosI = -(dx * nx + dy * ny);
    const k = 1 - eta * eta * (1 - cosI * cosI);
    if (k < 0) return null;                     // total internal reflection
    const cosT = Math.sqrt(k);
    const rx = eta * dx + (eta * cosI - cosT) * nx;
    const ry = eta * dy + (eta * cosI - cosT) * ny;
    const len = Math.hypot(rx, ry) || 1;
    return { dx: rx / len, dy: ry / len };
  }

  /** Trace one ray through all four interfaces; returns its polyline. */
  function traceRay(height) {
    const indices = [1, N_WALL, nLiquid, N_WALL, 1];
    const points = [{ x: frontX - 60, y: height }];
    let px = frontX - 60;
    let py = height;
    let dx = 1;
    let dy = 0;

    for (let i = 0; i < SURFACES.length; i++) {
      const surface = SURFACES[i];
      const hit = hitCircle(px, py, dx, dy, surface);
      if (!hit) return { points, ok: false };

      let nx = (hit.x - surface.cx) / surface.r;
      let ny = hit.y / surface.r;
      if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }

      const next = refract(dx, dy, nx, ny, indices[i] / indices[i + 1]);
      points.push({ x: hit.x, y: hit.y });
      if (!next) return { points, ok: false };

      px = hit.x;
      py = hit.y;
      dx = next.dx;
      dy = next.dy;
    }

    points.push({ x: px + dx * 260, y: py + dy * 260 });
    return { points, ok: true };
  }

  /** Where the exiting rays cross the axis, averaged over the inner bundle. */
  function focusDistance(rays) {
    let sum = 0;
    let count = 0;
    for (const ray of rays) {
      if (!ray.ok) continue;
      const a = ray.points[ray.points.length - 2];
      const b = ray.points[ray.points.length - 1];
      const slope = b.y - a.y;
      if (Math.abs(slope) < 1e-9) continue;
      const x = a.x - (a.y * (b.x - a.x)) / slope;
      if (x > rearX) { sum += x; count++; }
    }
    return count ? sum / count : null;
  }

  function step(dt) {
    time += dt;
    // A slow breath through the plausible range for a watery liquid.
    nLiquid = 1.39 + 0.09 * Math.sin(time * 0.42);
  }

  function draw() {
    const { w, h } = syncSize(canvas, ctx);
    clearFrame(ctx, w, h);
    drawStars(ctx, stars, w, h);

    const rays = [];
    for (let i = 0; i < rayCount; i++) {
      const height = -BEAM / 2 + (BEAM * i) / (rayCount - 1);
      rays.push(traceRay(height));
    }

    const focus = focusDistance(rays);
    const targetX = focus !== null ? focus : rearX + 40;

    // Fit the whole scene, leaving a little air around it.
    const spanX = (targetX + 30) - (frontX - 62);
    const spanY = HALF_HEIGHT * 2.5;
    const scale = Math.min((w * 0.94) / spanX, (h * 0.9) / spanY);
    const ox = w / 2 - ((frontX - 62 + targetX + 30) / 2) * scale;
    const oy = h / 2;
    const sx = (x) => ox + x * scale;
    const sy = (y) => oy - y * scale;

    // --- Bottle outline: barrel flats plus the two caps.
    const capPath = (radius, halfHeight, join) => {
      ctx.beginPath();
      const top = Math.atan2(halfHeight, join - cL);
      const bottom = 2 * Math.PI - top;
      ctx.arc(sx(cL), sy(0), radius * scale, -bottom, -top, false);
      ctx.lineTo(sx(-join), sy(halfHeight));
      const rTop = Math.atan2(halfHeight, -join - cR);
      ctx.arc(sx(cR), sy(0), radius * scale, -rTop, rTop, false);
      ctx.closePath();
    };

    // The inner arc meets the inner flat slightly inboard of the outer join —
    // a real property of offset curves, not an approximation.
    const innerHalf = HALF_HEIGHT - WALL;
    const innerRadius = CAP_RADIUS - WALL;
    const outerJoin = BODY / 2;
    const innerJoin = -(cL - Math.sqrt(innerRadius * innerRadius - innerHalf * innerHalf));

    ctx.save();
    capPath(CAP_RADIUS, HALF_HEIGHT, -outerJoin);
    ctx.fillStyle = "rgba(160, 190, 215, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 224, 240, 0.6)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    capPath(innerRadius, innerHalf, -innerJoin);
    ctx.fillStyle = `rgba(90, 175, 215, ${0.14 + (nLiquid - 1.3) * 0.5})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(131, 184, 215, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // --- Rays, blended additively so the caustic emerges from ray density.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    ctx.globalAlpha = preview ? 0.55 : 0.45;

    const segmentColor = ["incoming", "wall", "liquid", "wall", "exit"];
    for (const ray of rays) {
      for (let i = 0; i < ray.points.length - 1; i++) {
        ctx.strokeStyle = RAY_COLORS[segmentColor[i]] || RAY_COLORS.exit;
        ctx.beginPath();
        ctx.moveTo(sx(ray.points[i].x), sy(ray.points[i].y));
        ctx.lineTo(sx(ray.points[i + 1].x), sy(ray.points[i + 1].y));
        ctx.stroke();
      }
    }
    ctx.restore();

    // --- Focus glow and the target screen that tracks it.
    if (focus !== null) {
      halo(ctx, sx(focus), sy(0), Math.max(10, 16 * scale), LAB.gold, 0.5);
      ctx.save();
      ctx.strokeStyle = rgba(LAB.ink, 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx(targetX), sy(HALF_HEIGHT * 1.15));
      ctx.lineTo(sx(targetX), sy(-HALF_HEIGHT * 1.15));
      ctx.stroke();
      ctx.restore();
    }

    if (!preview) {
      ctx.save();
      ctx.fillStyle = rgba(LAB.muted, 0.75);
      ctx.font = '500 11px "DM Sans", system-ui, sans-serif';
      ctx.fillText(`n = ${nLiquid.toFixed(3)}`, 14, h - 30);
      if (focus !== null) {
        ctx.fillText(`focus ${(focus - rearX).toFixed(0)} mm past the bottle`, 14, h - 14);
      }
      ctx.restore();
    }
  }

  return { step, draw, reset() { time = 0; }, dispose() {} };
}
