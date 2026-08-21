// ============================================================
// DIFFUSION AND MIXING
// Two species start cleanly separated. Lift the barrier and they
// mix — never to unmix, though every individual collision here is
// perfectly time-reversible. That asymmetry is the whole point:
// mixing wins because mixed arrangements vastly outnumber sorted
// ones, not because any single collision prefers a direction.
//
// The collisions are essential rather than decorative. Without
// them particles would simply stream ballistically across the box,
// which is free expansion, not diffusion — the random walk that
// makes diffusion slow and √t-like comes entirely from scattering.
// ============================================================
import {
  LAB, rgba, syncSize, clearFrame, label, clamp
} from "../core.js";

const WORLD_W = 100;
const WORLD_H = 62;
const RADIUS = 0.95;

export function createDiffusion(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");

  let view = syncSize(canvas, ctx);

  const state = {
    count: preview ? 150 : 260,
    temperature: 1,
    barrier: true,
    autoCycle: preview,
    elapsed: 0,
    history: [],
    sampleAcc: 0
  };

  let x = null;
  let y = null;
  let vx = null;
  let vy = null;
  let species = null;

  // Uniform grid for neighbour lookup — O(N) instead of the O(N²)
  // every-pair sweep, which matters once the count slider is high.
  let cell = RADIUS * 2;
  let cols = 1;
  let rows = 1;
  let heads = null;
  let next = null;

  function gaussian() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function allocate(n) {
    x = new Float32Array(n);
    y = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    species = new Uint8Array(n);
    next = new Int32Array(n);

    cols = Math.max(1, Math.ceil(WORLD_W / cell));
    rows = Math.max(1, Math.ceil(WORLD_H / cell));
    heads = new Int32Array(cols * rows);
  }

  function reset() {
    const n = state.count;
    allocate(n);

    // Thermal speeds: each velocity component normally distributed,
    // which gives the Maxwell-Boltzmann speed distribution.
    const sigma = 6 * Math.sqrt(state.temperature);
    const half = WORLD_W / 2;

    for (let i = 0; i < n; i++) {
      const left = i < n / 2;
      species[i] = left ? 0 : 1;

      const margin = RADIUS * 1.5;
      x[i] = left
        ? margin + Math.random() * (half - margin * 2)
        : half + margin + Math.random() * (half - margin * 2);
      y[i] = margin + Math.random() * (WORLD_H - margin * 2);

      vx[i] = gaussian() * sigma;
      vy[i] = gaussian() * sigma;
    }

    state.barrier = true;
    state.elapsed = 0;
    state.history.length = 0;
    state.sampleAcc = 0;
  }

  function buildGrid() {
    heads.fill(-1);
    const n = state.count;
    for (let i = 0; i < n; i++) {
      const cxi = clamp(Math.floor(x[i] / cell), 0, cols - 1);
      const cyi = clamp(Math.floor(y[i] / cell), 0, rows - 1);
      const index = cyi * cols + cxi;
      next[i] = heads[index];
      heads[index] = i;
    }
  }

  function collidePair(i, j) {
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const distSq = dx * dx + dy * dy;
    const min = RADIUS * 2;

    if (distSq >= min * min || distSq === 0) return;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    // Normal component of the relative velocity.
    const rel = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;

    // Only resolve if they are actually approaching, otherwise
    // overlapping pairs get repeatedly "collided" and gain energy.
    if (rel < 0) {
      // Equal masses, perfectly elastic: exchange the normal
      // components and leave the tangential ones untouched.
      vx[i] += rel * nx;
      vy[i] += rel * ny;
      vx[j] -= rel * nx;
      vy[j] -= rel * ny;
    }

    // Positional correction so pairs never sink into each other.
    const overlap = (min - dist) * 0.5;
    x[i] -= nx * overlap;
    y[i] -= ny * overlap;
    x[j] += nx * overlap;
    y[j] += ny * overlap;
  }

  function resolveCollisions() {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let i = heads[cy * cols + cx];
        while (i !== -1) {
          // Scan this cell and the eight around it. The j > i test
          // keeps each pair from being resolved twice.
          for (let oy = -1; oy <= 1; oy++) {
            const ny = cy + oy;
            if (ny < 0 || ny >= rows) continue;
            for (let ox = -1; ox <= 1; ox++) {
              const nx = cx + ox;
              if (nx < 0 || nx >= cols) continue;

              let j = heads[ny * cols + nx];
              while (j !== -1) {
                if (j > i) collidePair(i, j);
                j = next[j];
              }
            }
          }
          i = next[i];
        }
      }
    }
  }

  function step(dt) {
    const clamped = Math.min(dt, 1 / 30);
    const substeps = 2;
    const h = clamped / substeps;
    const n = state.count;
    const half = WORLD_W / 2;

    for (let s = 0; s < substeps; s++) {
      for (let i = 0; i < n; i++) {
        x[i] += vx[i] * h;
        y[i] += vy[i] * h;

        // Walls
        if (x[i] < RADIUS) { x[i] = RADIUS; vx[i] = Math.abs(vx[i]); }
        else if (x[i] > WORLD_W - RADIUS) { x[i] = WORLD_W - RADIUS; vx[i] = -Math.abs(vx[i]); }

        if (y[i] < RADIUS) { y[i] = RADIUS; vy[i] = Math.abs(vy[i]); }
        else if (y[i] > WORLD_H - RADIUS) { y[i] = WORLD_H - RADIUS; vy[i] = -Math.abs(vy[i]); }

        // Central barrier
        if (state.barrier) {
          if (x[i] > half - RADIUS && x[i] < half && vx[i] > 0) {
            x[i] = half - RADIUS;
            vx[i] = -vx[i];
          } else if (x[i] < half + RADIUS && x[i] >= half && vx[i] < 0) {
            x[i] = half + RADIUS;
            vx[i] = -vx[i];
          }
        }
      }

      buildGrid();
      resolveCollisions();
    }

    state.elapsed += clamped;

    // Sample the mixing fraction a few times a second.
    state.sampleAcc += clamped;
    if (state.sampleAcc >= 0.1) {
      state.sampleAcc = 0;
      state.history.push(mixFraction());
      if (state.history.length > 240) state.history.shift();
    }

    // Preview loops on its own so the card is never a static box.
    if (state.autoCycle) {
      if (state.barrier && state.elapsed > 2.5) state.barrier = false;
      else if (!state.barrier && state.elapsed > 20) reset();
    }
  }

  // Fraction of species A still in the left half: 1 when sorted,
  // 0.5 once fully mixed.
  function mixFraction() {
    const n = state.count;
    const half = WORLD_W / 2;
    let total = 0;
    let left = 0;
    for (let i = 0; i < n; i++) {
      if (species[i] !== 0) continue;
      total++;
      if (x[i] < half) left++;
    }
    return total === 0 ? 0.5 : left / total;
  }

  function draw() {
    view = syncSize(canvas, ctx);
    const { w, h } = view;

    // Full mode reserves a strip under the box for the mixing curve;
    // overlaying it on the particles made both harder to read.
    const pad = preview ? 6 : 16;
    const graphH = preview ? 0 : 54;
    const graphGap = preview ? 0 : 26;

    const availW = w - pad * 2;
    const availH = h - pad * 2 - graphH - graphGap;
    const scale = Math.min(availW / WORLD_W, availH / WORLD_H);

    const boxW = WORLD_W * scale;
    const boxH = WORLD_H * scale;
    const offX = (w - boxW) / 2;
    const offY = preview ? (h - boxH) / 2 : pad;

    clearFrame(ctx, w, h);

    // Container
    ctx.save();
    ctx.strokeStyle = LAB.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(offX, offY, boxW, boxH);
    ctx.restore();

    // Barrier
    if (state.barrier) {
      ctx.save();
      ctx.strokeStyle = rgba(LAB.ink, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(offX + boxW / 2, offY);
      ctx.lineTo(offX + boxW / 2, offY + boxH);
      ctx.stroke();
      ctx.restore();
    }

    // Particles. Drawn as flat discs in one batched path per species
    // — per-particle shadowBlur would cost more than the physics.
    const radius = Math.max(1.1, RADIUS * scale);
    const n = state.count;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let s = 0; s < 2; s++) {
      ctx.fillStyle = s === 0 ? rgba(LAB.blue, 0.9) : rgba(LAB.rust, 0.9);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (species[i] !== s) continue;
        const px = offX + x[i] * scale;
        const py = offY + y[i] * scale;
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();

    // Mixing curve, in its own strip beneath the box
    if (!preview && state.history.length > 2) {
      const gw = boxW;
      const gh = graphH - 16;
      const gx = offX;
      const gy = offY + boxH + graphGap;

      label(ctx, "left-half fraction", gx, gy - 8, LAB.muted, 9);

      ctx.save();
      ctx.strokeStyle = LAB.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gw, gh);

      // Fully-mixed reference line at 0.5
      ctx.strokeStyle = rgba(LAB.muted, 0.35);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(gx, gy + gh * 0.5);
      ctx.lineTo(gx + gw, gy + gh * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = LAB.gold;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const count = state.history.length;
      for (let i = 0; i < count; i++) {
        const px = gx + (i / (count - 1)) * gw;
        const value = state.history[i];
        const py = gy + gh - value * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      // "fully mixed" marker on the reference line
      label(ctx, "0.5", gx + gw + 6, gy + gh * 0.5 + 3, rgba(LAB.muted, 0.7), 8);

      label(
        ctx,
        state.barrier ? "barrier in place" : "mixing",
        gx + gw - 96,
        gy - 8,
        state.barrier ? LAB.muted : LAB.gold,
        9
      );
    }
  }

  reset();

  return {
    step,
    draw,
    reset,
    controls: [
      {
        id: "barrier", label: "Barrier", type: "toggle", value: true
      },
      {
        id: "count", label: "Particles", type: "range",
        min: 60, max: 420, step: 20, value: state.count
      },
      {
        id: "temperature", label: "Temperature", type: "range",
        min: 0.2, max: 2.5, step: 0.1, value: state.temperature, unit: "×"
      },
      { id: "reset", label: "Re-separate", type: "button" }
    ],
    set(id, value) {
      if (id === "barrier") {
        state.barrier = value;
        state.autoCycle = false;
      } else if (id === "count") {
        state.count = Math.round(value);
        state.autoCycle = false;
        reset();
      } else if (id === "temperature") {
        // Rescale existing velocities so the change is felt at once
        // rather than only after the next reset.
        const ratio = Math.sqrt(value / state.temperature);
        for (let i = 0; i < state.count; i++) {
          vx[i] *= ratio;
          vy[i] *= ratio;
        }
        state.temperature = value;
      } else if (id === "reset") {
        state.autoCycle = false;
        reset();
      }
    },
    values() {
      return {
        barrier: state.barrier,
        count: state.count,
        temperature: state.temperature
      };
    },
    readouts() {
      const fraction = mixFraction();
      const mixed = (1 - Math.abs(fraction - 0.5) * 2) * 100;
      let energy = 0;
      for (let i = 0; i < state.count; i++) {
        energy += vx[i] * vx[i] + vy[i] * vy[i];
      }

      return [
        { label: "Left-half fraction", value: fraction.toFixed(3) },
        { label: "Mixed", value: `${mixed.toFixed(0)}%` },
        { label: "Particles", value: String(state.count) },
        { label: "Mean KE", value: (energy / (2 * state.count)).toFixed(1) }
      ];
    },
    note:
      "Every collision here is perfectly reversible, yet the curve only ever " +
      "falls toward 0.5 and stays there. Nothing forbids un-mixing — it is " +
      "just overwhelmingly unlikely.",
    dispose() {}
  };
}
