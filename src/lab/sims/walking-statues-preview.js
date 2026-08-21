// ============================================================
// WALKING STATUES — CARD PREVIEW
// A miniature of the full instrument at ./walking-statues/dist/,
// which is its own Vite/React/Three.js/Rapier3D app — far too
// heavy to import into a 2D canvas card, and built independently
// so it can be dropped in and opened as its own page.
//
// The full instrument resolves the question from real rigid-body
// contact, friction, and rope forces; there is no shortcut to that
// here. What this draws instead is the hypothesis under test: that
// rocking a statue onto alternating base edges and pivoting each
// edge forward can walk it down a road, leaving the zigzag
// trackway that real Moai-replica walking experiments look for.
// ============================================================
import {
  LAB, rgba, syncSize, clearFrame, halo, makeStars, drawStars
} from "../core.js";

const ROCK_PERIOD = 2.6;   // seconds per full left-right rock
const MAX_ROLL = 0.5;      // rad, how far the base tips onto an edge
const LATERAL_SWAY = 22;   // how far the COM sways toward the planted edge
const FORWARD_SPEED = 16;  // steady advance, units/second
const TRACK_RANGE = 150;   // distance travelled before the loop resets

export function createWalkingStatuesPreview(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");
  const stars = makeStars(preview ? 14 : 30, 63);

  let phase = 0;
  let travelled = 0;
  const trail = [];

  function reset() {
    phase = 0;
    travelled = 0;
    trail.length = 0;
  }

  function step(dt) {
    const omega = (2 * Math.PI) / ROCK_PERIOD;
    phase += omega * dt;

    // Progress is steadiest mid-rock, while the statue pivots through
    // a planted edge, and pauses near each roll extreme — the
    // halt-and-advance rhythm a rocked walking gait actually has.
    const gait = Math.abs(Math.sin(phase));
    travelled += FORWARD_SPEED * gait * dt;

    trail.push({ d: travelled, x: LATERAL_SWAY * Math.sin(phase) });
    while (trail.length && travelled - trail[0].d > TRACK_RANGE) trail.shift();

    if (travelled > TRACK_RANGE) reset();
  }

  function draw() {
    const { w, h } = syncSize(canvas, ctx);
    clearFrame(ctx, w, h);
    drawStars(ctx, stars, w, h);

    const roadHalfWidth = Math.min(w, h) * 0.24;
    const originX = w / 2;
    const topY = h * 0.08;
    const bottomY = h * 0.94;
    const scaleY = (bottomY - topY) / TRACK_RANGE;

    function toScreen(d, x) {
      return {
        sx: originX + x * (roadHalfWidth / 60),
        sy: bottomY - d * scaleY
      };
    }

    // Road
    ctx.save();
    ctx.strokeStyle = rgba(LAB.ink, 0.16);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(originX - roadHalfWidth, topY);
    ctx.lineTo(originX - roadHalfWidth, bottomY);
    ctx.moveTo(originX + roadHalfWidth, topY);
    ctx.lineTo(originX + roadHalfWidth, bottomY);
    ctx.stroke();

    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = rgba(LAB.ink, 0.12);
    ctx.beginPath();
    ctx.moveTo(originX, topY);
    ctx.lineTo(originX, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Zigzag trackway left behind
    if (trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = rgba(LAB.rust, 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      trail.forEach(function (p, i) {
        const { sx, sy } = toScreen(p.d, p.x);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.restore();
    }

    // The statue: rolled onto one base edge, swayed toward it,
    // pivoting forward.
    const roll = MAX_ROLL * Math.sin(phase);
    const sway = LATERAL_SWAY * Math.sin(phase);
    const { sx, sy } = toScreen(travelled, sway);

    const baseW = preview ? 15 : 22;
    const baseH = baseW * 0.55;
    const bodyH = preview ? 46 : 68;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(roll * 0.35);

    // Base footprint, with the currently loaded edge brighter — the
    // edge bearing the statue's weight and about to become the pivot.
    const leaning = roll > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.ellipse(0, 0, baseW, baseH, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(LAB.rust, 0.22);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(leaning * baseW * 0.35, 0, baseW * 0.62, baseH * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(LAB.rust, 0.55 + 0.35 * Math.abs(Math.sin(phase)));
    ctx.fill();

    // Torso, drawn behind the base so the card reads as an
    // elevation despite the top-down road beneath it.
    ctx.translate(0, -bodyH * 0.46);
    ctx.rotate(-roll * 0.6);
    const grad = ctx.createLinearGradient(0, -bodyH * 0.5, 0, bodyH * 0.5);
    grad.addColorStop(0, rgba(LAB.ink, 0.85));
    grad.addColorStop(1, rgba(LAB.rust, 0.6));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-baseW * 0.34, bodyH * 0.5);
    ctx.lineTo(-baseW * 0.22, -bodyH * 0.22);
    ctx.lineTo(-baseW * 0.3, -bodyH * 0.34);
    ctx.lineTo(-baseW * 0.16, -bodyH * 0.5);
    ctx.lineTo(baseW * 0.16, -bodyH * 0.5);
    ctx.lineTo(baseW * 0.3, -bodyH * 0.34);
    ctx.lineTo(baseW * 0.22, -bodyH * 0.22);
    ctx.lineTo(baseW * 0.34, bodyH * 0.5);
    ctx.closePath();
    ctx.fill();

    halo(ctx, 0, -bodyH * 0.42, baseW * 1.6, LAB.gold, 0.28);
    ctx.restore();
  }

  reset();
  return { step, draw, reset, dispose() {} };
}
