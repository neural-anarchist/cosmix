// ============================================================
// FOUCAULT PENDULUM
// Top-down view of a pendulum swinging in Earth's rotating frame.
// The Coriolis term rotates the swing plane at Ω sin(latitude),
// tracing the familiar rosette.
//
// ON TIME SCALES — the honest bit:
// A real Foucault pendulum swings in ~16 s but takes 24 h / sin λ
// to precess, a ratio of roughly 7400 : 1. Nothing can show both
// at their true rates. So the swing is set to a watchable period
// and the precession is scaled up by a fixed factor, which keeps
// the *shape* of the physics exact:
//   • precession still goes as sin(latitude)
//   • it still vanishes at the equator and peaks at the poles
//   • it still reverses in the southern hemisphere
// The readout always reports the true real-world period alongside
// the exaggeration factor, so the number on screen is never a lie.
// ============================================================
import {
  LAB, rgba, syncSize, createTrailLayer, clearFrame,
  glowDot, halo, makeStars, drawStars, label, clamp
} from "../core.js";

// Sidereal day — the rotation period that actually governs precession.
const SIDEREAL_DAY_HOURS = 23.9344696;

export function createFoucault(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");
  const stars = makeStars(preview ? 26 : 60, 11);

  let view = syncSize(canvas, ctx);
  let trail = createTrailLayer(view.w, view.h, view.dpr);

  // On-screen swing frequency, chosen so a single swing is easy to
  // follow rather than to match any particular real pendulum.
  const omega0 = 2.35;

  // Tuned so 45° gives roughly 46 swings per full revolution — dense
  // enough to read as a rosette, open enough to see individual swings.
  const PRECESSION_SCALE = omega0 / (46 * Math.sin(Math.PI / 4));

  const state = {
    x: 1,
    y: 0,
    vx: 0,
    vy: 0,
    latitude: preview ? 52 : 45,
    amplitude: 1,
    showPlane: true,
    elapsed: 0,
    precessed: 0,
    segment: []
  };

  function reset() {
    state.x = state.amplitude;
    state.y = 0;
    state.vx = 0;
    state.vy = 0;
    state.elapsed = 0;
    state.precessed = 0;
    state.segment.length = 0;
    trail.clear();
  }

  function omegaZ() {
    return PRECESSION_SCALE * Math.sin((state.latitude * Math.PI) / 180);
  }

  function step(dt) {
    // Fixed substeps keep the integration stable and give the trail
    // intermediate points to draw through.
    const substeps = 8;
    const h = dt / substeps;
    const oz = omegaZ();

    for (let i = 0; i < substeps; i++) {
      // Small-oscillation pendulum in a rotating frame:
      //   ẍ = -ω₀²x + 2Ω_z ẏ
      //   ÿ = -ω₀²y - 2Ω_z ẋ
      const ax = -omega0 * omega0 * state.x + 2 * oz * state.vy;
      const ay = -omega0 * omega0 * state.y - 2 * oz * state.vx;

      // Semi-implicit Euler: velocity first, then position. Stable
      // for oscillators where explicit Euler slowly gains energy.
      state.vx += ax * h;
      state.vy += ay * h;
      state.x += state.vx * h;
      state.y += state.vy * h;

      state.segment.push(state.x, state.y);
    }

    state.elapsed += dt;
    state.precessed -= oz * dt;
  }

  function draw() {
    const next = syncSize(canvas, ctx);
    if (next.changed) {
      trail.resize(next.w, next.h, next.dpr);
      state.segment.length = 0;
    }
    view = next;

    const { w, h } = view;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;

    // --- trail layer ---
    // Deliberately slow: the rosette is the whole point, and it only
    // emerges once many swings accumulate. Recent swings still read
    // brighter, but old ones have to survive long enough to draw the
    // full flower.
    trail.fade(preview ? 0.006 : 0.002);

    const tctx = trail.ctx;
    if (state.segment.length >= 4) {
      tctx.save();
      tctx.globalCompositeOperation = "lighter";
      tctx.strokeStyle = rgba(LAB.gold, 0.55);
      tctx.lineWidth = 1.1;
      tctx.lineCap = "round";
      tctx.beginPath();
      tctx.moveTo(cx + state.segment[0] * radius, cy + state.segment[1] * radius);
      for (let i = 2; i < state.segment.length; i += 2) {
        tctx.lineTo(cx + state.segment[i] * radius, cy + state.segment[i + 1] * radius);
      }
      tctx.stroke();
      tctx.restore();
    }
    state.segment.length = 0;

    // --- frame ---
    clearFrame(ctx, w, h);
    drawStars(ctx, stars, w, h);

    // Compass ring + ticks
    ctx.save();
    ctx.strokeStyle = LAB.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.stroke();

    const ticks = 36;
    for (let i = 0; i < ticks; i++) {
      const angle = (i / ticks) * Math.PI * 2;
      const major = i % 9 === 0;
      const inner = radius * (major ? 1.05 : 1.09);
      const outer = radius * 1.12;
      ctx.globalAlpha = major ? 0.55 : 0.25;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // Swing plane through the origin
    if (state.showPlane) {
      const angle = Math.atan2(state.y, state.x);
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = LAB.blue;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * radius * 1.12, cy - Math.sin(angle) * radius * 1.12);
      ctx.lineTo(cx + Math.cos(angle) * radius * 1.12, cy + Math.sin(angle) * radius * 1.12);
      ctx.stroke();
      ctx.restore();
    }

    trail.blitTo(ctx);

    // Pivot
    ctx.save();
    ctx.fillStyle = rgba(LAB.ink, 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bob
    const bx = cx + state.x * radius;
    const by = cy + state.y * radius;
    halo(ctx, bx, by, preview ? 16 : 26, LAB.gold, 0.5);
    glowDot(ctx, bx, by, preview ? 3.2 : 4.6, LAB.gold, 18);

    if (!preview) {
      label(ctx, `${state.latitude.toFixed(0)}° latitude`, 14, h - 14, LAB.muted, 10);
    }
  }

  // True precession period at this latitude, in hours.
  function truePeriodHours() {
    const s = Math.abs(Math.sin((state.latitude * Math.PI) / 180));
    if (s < 1e-6) return Infinity;
    return SIDEREAL_DAY_HOURS / s;
  }

  reset();

  return {
    step,
    draw,
    reset,
    controls: [
      {
        id: "latitude", label: "Latitude", type: "range",
        min: -90, max: 90, step: 1, value: state.latitude, unit: "°"
      },
      {
        id: "amplitude", label: "Amplitude", type: "range",
        min: 0.35, max: 1, step: 0.05, value: state.amplitude
      },
      { id: "showPlane", label: "Swing plane", type: "toggle", value: true },
      { id: "reset", label: "Restart", type: "button" }
    ],
    set(id, value) {
      if (id === "latitude") {
        state.latitude = clamp(value, -90, 90);
        trail.clear();
        state.precessed = 0;
      } else if (id === "amplitude") {
        state.amplitude = value;
        reset();
      } else if (id === "showPlane") {
        state.showPlane = value;
      } else if (id === "reset") {
        reset();
      }
    },
    values() {
      return {
        latitude: state.latitude,
        amplitude: state.amplitude,
        showPlane: state.showPlane
      };
    },
    readouts() {
      const hours = truePeriodHours();
      const swings = Math.abs(omegaZ()) < 1e-9
        ? "∞"
        : (omega0 / Math.abs(omegaZ())).toFixed(0);

      return [
        {
          label: "True precession period",
          value: hours === Infinity ? "never (equator)" : `${hours.toFixed(1)} h`
        },
        { label: "Swings per revolution", value: swings },
        {
          label: "Plane rotated",
          value: `${((state.precessed * 180) / Math.PI).toFixed(0)}°`
        },
        {
          label: "Direction",
          value: state.latitude > 0.5 ? "clockwise (N)"
            : state.latitude < -0.5 ? "counter-clockwise (S)"
            : "none"
        }
      ];
    },
    note:
      "Precession is shown far faster than reality — a real pendulum needs " +
      "hours. The sin(latitude) law is exact: drag to the equator and the " +
      "rosette collapses to a straight line.",
    dispose() {}
  };
}
