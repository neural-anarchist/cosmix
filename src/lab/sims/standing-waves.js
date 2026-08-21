// ============================================================
// STANDING WAVES ON A STRING — CARD PREVIEW
// A miniature of the full instrument at ./standing-waves/,
// which is a standalone page (classic script, no modules) so
// that it opens straight from disk. That independence is
// deliberate, and it is why this small preview restates the
// physics rather than importing it.
//
// A string clamped at both ends. Two counter-propagating waves
// superpose into a standing wave:
//
//   A sin(kx - ωt) + A sin(kx + ωt) = 2A sin(kx) cos(ωt)
//
// Only wavelengths fitting a whole number of half-wavelengths in
// the length survive, which is the whole quantisation story in
// its simplest form: k = nπ/L, ω = vk.
//
// This is the ideal-string model only — perfectly flexible,
// uniform tension, small displacement. The full page keeps that
// as its baseline and adds fretted geometry, bending stiffness
// and amplitude-dependent tension on top.
// ============================================================
import {
  LAB, rgba, syncSize, clearFrame, glowDot, halo,
  makeStars, drawStars, label, clamp
} from "../core.js";

// A plain steel guitar string: 648 mm of 0.41 mm wire at 104 N.
const DEFAULT_LENGTH = 0.648;      // m
const DEFAULT_TENSION = 104;       // N
const DEFAULT_DENSITY = 1.02;      // g/m

// Real fundamentals here are a few hundred hertz, far too fast to watch, so
// physical time runs slow by this factor. Every reported number stays physical.
const SLOW_MOTION = 400;

export function createStandingWaves(canvas, options = {}) {
  const preview = !!options.preview;
  const ctx = canvas.getContext("2d");
  const stars = makeStars(preview ? 22 : 50, 23);

  let view = syncSize(canvas, ctx);

  const state = {
    harmonic: preview ? 3 : 2,
    amplitude: 0.72,
    speed: 1,
    length: DEFAULT_LENGTH,
    tension: DEFAULT_TENSION,
    density: DEFAULT_DENSITY,
    showComponents: !preview,
    showEnvelope: true,
    blend: 0,        // amplitude of the second harmonic
    blendHarmonic: 3,
    t: 0             // physical seconds
  };

  function reset() {
    state.t = 0;
  }

  function step(dt) {
    state.t += (dt * state.speed) / SLOW_MOTION;
  }

  // --- the ideal-string physics ---

  // v = sqrt(T/μ), with μ given in g/m.
  function waveSpeed() {
    return Math.sqrt(state.tension / (state.density * 1e-3));
  }

  // f_n = (n / 2L) sqrt(T/μ).
  function frequency(n) {
    return (n * waveSpeed()) / (2 * state.length);
  }

  // Displacement of the standing wave at position u∈[0,1], in units of the
  // display amplitude.
  function primary(u, t) {
    const k = state.harmonic * Math.PI;
    const omega = 2 * Math.PI * frequency(state.harmonic);
    return state.amplitude * Math.sin(k * u) * Math.cos(omega * t);
  }

  function secondary(u, t) {
    if (state.blend <= 0) return 0;
    const k = state.blendHarmonic * Math.PI;
    const omega = 2 * Math.PI * frequency(state.blendHarmonic);
    return state.blend * state.amplitude * Math.sin(k * u) * Math.cos(omega * t);
  }

  function displacement(u, t) {
    return primary(u, t) + secondary(u, t);
  }

  // The two travelling waves whose sum is the standing wave.
  function travelling(u, t, direction) {
    const k = state.harmonic * Math.PI;
    const omega = 2 * Math.PI * frequency(state.harmonic);
    return 0.5 * state.amplitude * Math.sin(k * u - direction * omega * t);
  }

  function draw() {
    view = syncSize(canvas, ctx);
    const { w, h } = view;

    const padX = w * (preview ? 0.09 : 0.08);
    const spanX = w - padX * 2;
    const midY = h * 0.5;
    const scaleY = h * (preview ? 0.24 : 0.26);

    clearFrame(ctx, w, h);
    drawStars(ctx, stars, w, h);

    const samples = Math.max(80, Math.round(spanX / 2));

    // --- envelope ---
    if (state.showEnvelope) {
      ctx.save();
      ctx.strokeStyle = rgba(LAB.blue, 0.22);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);

      for (const sign of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const k = state.harmonic * Math.PI;
          const env = sign * (state.amplitude + state.blend * state.amplitude)
            * Math.abs(Math.sin(k * u));
          const x = padX + u * spanX;
          const y = midY - env * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- component travelling waves ---
    if (state.showComponents && state.blend <= 0) {
      ctx.save();
      ctx.lineWidth = 1;
      const tints = [rgba(LAB.violet, 0.3), rgba(LAB.gold, 0.3)];

      [1, -1].forEach(function (direction, index) {
        ctx.strokeStyle = tints[index];
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const x = padX + u * spanX;
          const y = midY - travelling(u, state.t, direction) * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // --- equilibrium axis ---
    ctx.save();
    ctx.strokeStyle = rgba(LAB.ink, 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    ctx.lineTo(padX + spanX, midY);
    ctx.stroke();
    ctx.restore();

    // --- the string ---
    ctx.save();
    ctx.strokeStyle = LAB.blue;
    ctx.lineWidth = preview ? 1.8 : 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = LAB.blue;
    ctx.shadowBlur = preview ? 8 : 14;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = padX + u * spanX;
      const y = midY - displacement(u, state.t) * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // --- nodes ---
    // Nodes only exist for a pure harmonic; superposing two harmonics
    // leaves only the shared ones, so they are hidden while blending.
    if (state.blend <= 0) {
      for (let m = 0; m <= state.harmonic; m++) {
        const u = m / state.harmonic;
        const x = padX + u * spanX;
        glowDot(ctx, x, midY, preview ? 2 : 2.8, LAB.gold, 10);
      }

      // Antinodes — peak displacement points.
      for (let m = 0; m < state.harmonic; m++) {
        const u = (m + 0.5) / state.harmonic;
        const x = padX + u * spanX;
        const y = midY - displacement(u, state.t) * scaleY;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = rgba(LAB.gold, 0.5);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- clamped ends ---
    [padX, padX + spanX].forEach(function (x) {
      ctx.save();
      ctx.fillStyle = rgba(LAB.ink, 0.55);
      ctx.fillRect(x - 2, midY - h * 0.11, 4, h * 0.22);
      ctx.restore();
      halo(ctx, x, midY, preview ? 10 : 16, LAB.ink, 0.18);
    });

    if (!preview) {
      label(ctx, `n = ${state.harmonic}`, 14, h - 14, LAB.muted, 10);
    }
  }

  return {
    step,
    draw,
    reset,
    controls: [
      {
        id: "harmonic", label: "Harmonic (n)", type: "range",
        min: 1, max: 8, step: 1, value: state.harmonic
      },
      {
        id: "length", label: "Length L", type: "range",
        min: 0.2, max: 1.2, step: 0.005, value: state.length, unit: " m"
      },
      {
        id: "tension", label: "Tension T", type: "range",
        min: 20, max: 260, step: 1, value: state.tension, unit: " N"
      },
      {
        id: "density", label: "Linear density μ", type: "range",
        min: 0.15, max: 9, step: 0.01, value: state.density, unit: " g/m"
      },
      {
        id: "amplitude", label: "Amplitude", type: "range",
        min: 0.15, max: 1, step: 0.05, value: state.amplitude
      },
      {
        id: "speed", label: "Speed", type: "range",
        min: 0, max: 2, step: 0.05, value: state.speed, unit: "×"
      },
      {
        id: "blend", label: "Add 3rd harmonic", type: "range",
        min: 0, max: 1, step: 0.05, value: 0
      },
      { id: "showComponents", label: "Travelling components", type: "toggle", value: true },
      { id: "showEnvelope", label: "Envelope", type: "toggle", value: true }
    ],
    set(id, value) {
      if (id === "harmonic") state.harmonic = clamp(Math.round(value), 1, 8);
      else if (id === "length") state.length = clamp(value, 0.05, 3);
      else if (id === "tension") state.tension = clamp(value, 1, 500);
      else if (id === "density") state.density = clamp(value, 0.02, 40);
      else if (id === "amplitude") state.amplitude = value;
      else if (id === "speed") state.speed = value;
      else if (id === "blend") state.blend = value;
      else if (id === "showComponents") state.showComponents = value;
      else if (id === "showEnvelope") state.showEnvelope = value;
    },
    values() {
      return {
        harmonic: state.harmonic,
        length: state.length,
        tension: state.tension,
        density: state.density,
        amplitude: state.amplitude,
        speed: state.speed,
        blend: state.blend,
        showComponents: state.showComponents,
        showEnvelope: state.showEnvelope
      };
    },
    readouts() {
      const n = state.harmonic;
      const f = frequency(n);
      return [
        { label: "Wave speed", value: `${waveSpeed().toFixed(1)} m/s` },
        { label: "Wavelength", value: `${((2 * state.length * 1000) / n).toFixed(1)} mm` },
        { label: "Frequency", value: `${f.toFixed(2)} Hz` },
        { label: "Fundamental", value: `${frequency(1).toFixed(2)} Hz` },
        { label: "Nodes", value: String(n + 1) },
        { label: "Antinodes", value: String(n) }
      ];
    },
    note:
      "The two faint waves travel in opposite directions; their sum is the " +
      "bright string. Where they always cancel you get a node — which is why " +
      "only whole numbers of half-wavelengths fit. Frequencies are the real " +
      "f = (n/2L)√(T/μ); the motion is slowed 400× to be watchable.",
    dispose() {}
  };
}
