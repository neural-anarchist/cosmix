// ============================================================
// MAGNETIC PENDULUM CRADLE — CARD PREVIEW
// A miniature of the full instrument at ./cradle/, which is a
// standalone page (classic script, no modules) so that it opens
// straight from disk. That independence is deliberate, and it is
// why this small preview restates the physics rather than
// importing it.
//
// Same model as the full page: nonlinear gravity, linear damping,
// and dipole coupling κ_ij = μ0 μi μj / (2π d³).
// ============================================================
import {
  LAB, rgba, syncSize, clearFrame, glowDot, makeStars, drawStars
} from "../core.js";

const MU0_OVER_2PI = 2e-7;
const ACCENTS = [LAB.gold, LAB.blue, LAB.violet];

export function createCradlePreview(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");
  const stars = makeStars(preview ? 18 : 40, 47);

  let view = syncSize(canvas, ctx);

  const N = 3;
  const L = 0.32;
  const mass = 0.18;
  const mu = 44;
  const d = 0.155;
  const g = 9.81;
  const damping = 0.004;

  // κ for every pair; falls as 1/|i−j|³.
  const kappa = [];
  for (let i = 0; i < N; i++) {
    kappa.push(new Array(N).fill(0));
  }
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const value = (MU0_OVER_2PI * mu * mu) / Math.pow(Math.abs(j - i) * d, 3);
      kappa[i][j] = value;
      kappa[j][i] = value;
    }
  }

  let theta = [0.38, 0, 0];
  let omega = [0, 0, 0];
  let elapsed = 0;

  function derivatives(th, om) {
    const dTheta = om.slice();
    const dOmega = new Array(N);
    for (let i = 0; i < N; i++) {
      let magnetic = 0;
      for (let j = 0; j < N; j++) {
        if (j !== i) magnetic -= kappa[i][j] * (th[i] - th[j]);
      }
      dOmega[i] =
        -(g / L) * Math.sin(th[i]) -
        damping * om[i] +
        magnetic / (mass * L * L);
    }
    return { dTheta, dOmega };
  }

  function rk4(h) {
    const shift = (base, delta, factor) =>
      base.map(function (value, i) { return value + delta[i] * factor; });

    const k1 = derivatives(theta, omega);
    const k2 = derivatives(shift(theta, k1.dTheta, h / 2), shift(omega, k1.dOmega, h / 2));
    const k3 = derivatives(shift(theta, k2.dTheta, h / 2), shift(omega, k2.dOmega, h / 2));
    const k4 = derivatives(shift(theta, k3.dTheta, h), shift(omega, k3.dOmega, h));

    for (let i = 0; i < N; i++) {
      theta[i] += (h / 6) * (k1.dTheta[i] + 2 * k2.dTheta[i] + 2 * k3.dTheta[i] + k4.dTheta[i]);
      omega[i] += (h / 6) * (k1.dOmega[i] + 2 * k2.dOmega[i] + 2 * k3.dOmega[i] + k4.dOmega[i]);
    }
  }

  function reset() {
    theta = [0.38, 0, 0];
    omega = [0, 0, 0];
    elapsed = 0;
  }

  function step(dt) {
    const substeps = 4;
    const h = Math.min(dt, 0.05) / substeps;
    for (let i = 0; i < substeps; i++) rk4(h);

    elapsed += dt;
    // Damping slowly drains the swing; restart so the card keeps moving.
    if (elapsed > 90) reset();
  }

  function draw() {
    view = syncSize(canvas, ctx);
    const { w, h } = view;

    clearFrame(ctx, w, h);
    drawStars(ctx, stars, w, h);

    const spanX = (N - 1) * d + 2 * L * 0.7;
    const spanY = L * 1.2;
    const scale = Math.min((w * 0.84) / spanX, (h * 0.8) / spanY);

    // Centre vertically — width is the binding constraint, so anchoring to a
    // fixed fraction of the height leaves dead space beneath the bobs.
    const pivotY = Math.max(14, (h - L * scale) / 2);
    const firstX = w / 2 - ((N - 1) * d * scale) / 2;

    // Support beam
    ctx.save();
    ctx.strokeStyle = rgba(LAB.ink, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(firstX - 16, pivotY);
    ctx.lineTo(firstX + (N - 1) * d * scale + 16, pivotY);
    ctx.stroke();
    ctx.restore();

    const positions = [];
    for (let i = 0; i < N; i++) {
      const px = firstX + i * d * scale;
      positions.push({
        px,
        bx: px + L * Math.sin(theta[i]) * scale,
        by: pivotY + L * Math.cos(theta[i]) * scale
      });
    }

    // Coupling links between adjacent bobs
    ctx.save();
    ctx.strokeStyle = rgba(LAB.violet, 0.3);
    ctx.lineWidth = 1;
    for (let i = 0; i < N - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(positions[i].bx, positions[i].by);
      ctx.lineTo(positions[i + 1].bx, positions[i + 1].by);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < N; i++) {
      const { px, bx, by } = positions[i];

      ctx.save();
      ctx.strokeStyle = rgba(LAB.ink, 0.4);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(px, pivotY);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();

      // Bob drawn as a two-pole magnet, split across the rod axis.
      const dirX = Math.sin(theta[i]);
      const dirY = Math.cos(theta[i]);
      const phi = Math.atan2(dirY, dirX);
      const radius = preview ? 6.5 : 10;

      ctx.save();
      ctx.shadowColor = rgba(ACCENTS[i % ACCENTS.length], 0.9);
      ctx.shadowBlur = 12;
      ctx.fillStyle = LAB.rust;
      ctx.beginPath();
      ctx.arc(bx, by, radius, phi - Math.PI / 2, phi + Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = LAB.blue;
      ctx.beginPath();
      ctx.arc(bx, by, radius, phi + Math.PI / 2, phi + (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      glowDot(ctx, px, pivotY, 1.6, rgba(LAB.ink, 0.55), 4);
    }
  }

  reset();

  return { step, draw, reset, dispose() {} };
}
