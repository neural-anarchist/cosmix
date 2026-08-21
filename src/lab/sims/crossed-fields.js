// ============================================================
// CHARGED PARTICLE IN CROSSED E AND B FIELDS
// Lorentz force F = q(E + v × B), with B perpendicular to the
// screen and E in the plane. Three classic regimes fall out of
// the same integrator:
//
//   • E = 0            → a closed cyclotron circle
//   • E ⊥ B            → a cycloid drifting at v = E/B
//   • qE = qvB         → the velocity selector: a straight line
//
// The drift velocity E×B/B² is independent of both charge and
// mass, which is the surprising part worth seeing directly:
// flip the charge and the loops reverse but the drift does not.
// ============================================================
import {
  LAB, rgba, syncSize, createTrailLayer, clearFrame,
  glowDot, halo, label, arrow, clamp
} from "../core.js";

const PRESETS = {
  cyclotron: { E: 0, B: 1, vx: 0, vy: -6, charge: 1 },
  drift: { E: 2.2, B: 1, vx: 0, vy: -6, charge: 1 },
  selector: { E: 6, B: 1, vx: 6, vy: 0, charge: 1 }
};

export function createCrossedFields(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");

  let view = syncSize(canvas, ctx);
  let trail = createTrailLayer(view.w, view.h, view.dpr);

  // World is measured in units where the view spans WORLD_W across.
  const WORLD_W = 44;

  const state = {
    E: preview ? 2.2 : PRESETS.drift.E,
    B: 1,
    charge: 1,
    mass: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: -6,
    preset: "drift",
    showFields: true,
    segment: [],
    wrapped: false
  };

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.preset = name;
    state.E = preset.E;
    state.B = preset.B;
    state.charge = preset.charge;
    state.vx = preset.vx;
    state.vy = preset.vy;
    state.x = 0;
    state.y = 0;
    state.segment.length = 0;
    trail.clear();
  }

  function reset() {
    applyPreset(state.preset);
  }

  // --- Boris pusher ---
  // Chosen over RK4 deliberately: in a pure magnetic field the
  // rotation step is exactly norm-preserving, so the cyclotron
  // orbit closes on itself indefinitely. RK4 slowly bleeds energy
  // and the circle visibly spirals inward, which would make the
  // first preset look like a bug rather than physics.
  function push(dt) {
    const qm = (state.charge / state.mass) * dt * 0.5;

    // Half electric impulse. E points along +y on screen.
    let vx = state.vx;
    let vy = state.vy + qm * state.E;

    // Magnetic rotation.
    const t = qm * state.B;
    const s = (2 * t) / (1 + t * t);

    const vpx = vx + vy * t;
    const vpy = vy - vx * t;

    vx = vx + vpy * s;
    vy = vy - vpx * s;

    // Second half electric impulse.
    state.vx = vx;
    state.vy = vy + qm * state.E;

    state.x += state.vx * dt;
    state.y += state.vy * dt;
  }

  function step(dt) {
    const substeps = 6;
    const h = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      push(h);

      const halfW = WORLD_W / 2;
      const halfH = (WORLD_W * (view.h / Math.max(view.w, 1))) / 2;

      // Wrap toroidally so the particle never escapes the frame. The
      // flag tells the trail renderer to lift the pen, otherwise a
      // stray line streaks straight across the view.
      let wrapped = false;
      if (state.x > halfW) { state.x -= WORLD_W; wrapped = true; }
      else if (state.x < -halfW) { state.x += WORLD_W; wrapped = true; }
      if (state.y > halfH) { state.y -= halfH * 2; wrapped = true; }
      else if (state.y < -halfH) { state.y += halfH * 2; wrapped = true; }

      state.segment.push(state.x, state.y, wrapped ? 1 : 0);
    }
  }

  function draw() {
    const next = syncSize(canvas, ctx);
    if (next.changed) {
      trail.resize(next.w, next.h, next.dpr);
      state.segment.length = 0;
    }
    view = next;

    const { w, h } = view;
    const scale = w / WORLD_W;
    const cx = w / 2;
    const cy = h / 2;

    // --- trail ---
    trail.fade(preview ? 0.008 : 0.003);

    const tctx = trail.ctx;
    if (state.segment.length >= 6) {
      tctx.save();
      tctx.globalCompositeOperation = "lighter";
      tctx.strokeStyle = rgba(LAB.violet, 0.6);
      tctx.lineWidth = 1.3;
      tctx.lineCap = "round";
      tctx.beginPath();

      let penDown = false;
      for (let i = 0; i < state.segment.length; i += 3) {
        const px = cx + state.segment[i] * scale;
        const py = cy + state.segment[i + 1] * scale;
        const jump = state.segment[i + 2] === 1;

        if (!penDown || jump) {
          tctx.moveTo(px, py);
          penDown = true;
        } else {
          tctx.lineTo(px, py);
        }
      }
      tctx.stroke();
      tctx.restore();
    }
    state.segment.length = 0;

    clearFrame(ctx, w, h);

    // --- field markers ---
    if (state.showFields) {
      const spacing = preview ? 34 : 46;
      const into = state.B < 0;

      ctx.save();
      ctx.strokeStyle = rgba(LAB.blue, 0.28);
      ctx.fillStyle = rgba(LAB.blue, 0.28);
      ctx.lineWidth = 1;

      for (let gx = spacing / 2; gx < w; gx += spacing) {
        for (let gy = spacing / 2; gy < h; gy += spacing) {
          if (Math.abs(state.B) < 0.02) continue;
          const r = 3;
          ctx.beginPath();
          ctx.arc(gx, gy, r, 0, Math.PI * 2);
          ctx.stroke();

          if (into) {
            // × — field into the page
            ctx.beginPath();
            ctx.moveTo(gx - r * 0.6, gy - r * 0.6);
            ctx.lineTo(gx + r * 0.6, gy + r * 0.6);
            ctx.moveTo(gx + r * 0.6, gy - r * 0.6);
            ctx.lineTo(gx - r * 0.6, gy + r * 0.6);
            ctx.stroke();
          } else {
            // ⊙ — field out of the page
            ctx.beginPath();
            ctx.arc(gx, gy, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // E field arrows. Drawn as a full-height column at each station
      // with a clear head — short stubs at mid-height read as stray
      // marks rather than as a field.
      if (Math.abs(state.E) > 0.02) {
        const dir = state.E > 0 ? 1 : -1;
        const count = preview ? 4 : 7;
        const length = Math.min(h * 0.3, 54);
        const tint = rgba(LAB.gold, 0.34);

        for (let i = 0; i < count; i++) {
          const ax = ((i + 0.5) / count) * w;
          arrow(
            ctx,
            ax, cy - (length / 2) * dir,
            ax, cy + (length / 2) * dir,
            tint,
            1.1,
            preview ? 4.5 : 6
          );
        }

        label(
          ctx,
          "E",
          ((0.5) / count) * w + 7,
          cy + (length / 2) * dir + (dir > 0 ? 12 : -6),
          tint,
          9
        );
      }
    }

    trail.blitTo(ctx);

    // --- particle ---
    const px = cx + state.x * scale;
    const py = cy + state.y * scale;
    const tint = state.charge >= 0 ? LAB.violet : LAB.gold;
    halo(ctx, px, py, preview ? 14 : 22, tint, 0.55);
    glowDot(ctx, px, py, preview ? 3 : 4.2, tint, 16);

    if (!preview) {
      const bLabel = Math.abs(state.B) < 0.02
        ? "B = 0"
        : state.B < 0 ? "B into page" : "B out of page";
      label(ctx, bLabel, 14, h - 14, LAB.muted, 10);
    }
  }

  applyPreset(state.preset);

  return {
    step,
    draw,
    reset,
    controls: [
      {
        id: "preset", label: "Regime", type: "select",
        value: "drift",
        options: [
          { value: "cyclotron", label: "Cyclotron (E = 0)" },
          { value: "drift", label: "E × B drift" },
          { value: "selector", label: "Velocity selector" }
        ]
      },
      {
        id: "E", label: "Electric field", type: "range",
        min: 0, max: 8, step: 0.1, value: state.E
      },
      {
        id: "B", label: "Magnetic field", type: "range",
        min: -2, max: 2, step: 0.05, value: state.B
      },
      {
        id: "charge", label: "Charge sign", type: "select",
        value: "1",
        options: [
          { value: "1", label: "Positive (+q)" },
          { value: "-1", label: "Negative (−q)" }
        ]
      },
      { id: "showFields", label: "Field markers", type: "toggle", value: true },
      { id: "reset", label: "Relaunch", type: "button" }
    ],
    set(id, value) {
      if (id === "preset") applyPreset(value);
      else if (id === "E") state.E = value;
      else if (id === "B") state.B = value;
      else if (id === "charge") {
        state.charge = Number(value);
        trail.clear();
      } else if (id === "showFields") state.showFields = value;
      else if (id === "reset") reset();
    },
    values() {
      return {
        preset: state.preset,
        E: state.E,
        B: state.B,
        charge: String(state.charge),
        showFields: state.showFields
      };
    },
    readouts() {
      const speed = Math.hypot(state.vx, state.vy);
      const absB = Math.abs(state.B);

      const radius = absB < 0.02
        ? "∞ (straight)"
        : ((state.mass * speed) / (Math.abs(state.charge) * absB)).toFixed(2);

      const period = absB < 0.02
        ? "—"
        : ((2 * Math.PI * state.mass) / (Math.abs(state.charge) * absB)).toFixed(2) + " s";

      const drift = absB < 0.02 ? "—" : (state.E / absB).toFixed(2);

      return [
        { label: "Speed", value: speed.toFixed(2) },
        { label: "Cyclotron radius", value: String(radius) },
        { label: "Cyclotron period", value: period },
        { label: "Drift speed E/B", value: drift }
      ];
    },
    note:
      "Flip the charge sign: the loops wind the other way, but the sideways " +
      "drift keeps its direction and speed. That independence from charge and " +
      "mass is what makes an E×B filter work.",
    dispose() {}
  };
}
