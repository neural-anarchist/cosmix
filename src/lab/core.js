// ============================================================
// COSMIX LABORATORY — SHARED CORE
// Canvas sizing, fading trail layers, glow helpers, and the
// runner that drives every simulation in preview and full mode.
//
// Everything here is 2D canvas. Four live previews plus a detail
// view would exceed the browser's WebGL context budget, and these
// simulations are all 2D-native anyway.
// ============================================================

export const LAB = {
  space: "#070b14",
  spaceSoft: "#111a2c",
  ink: "#f4efe5",
  muted: "#acb4c5",
  gold: "#d7b470",
  blue: "#83b8d7",
  violet: "#9b6bff",
  rust: "#d68c70",
  line: "rgba(244, 239, 229, 0.16)"
};

const HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

export function rgba(hex, alpha) {
  const match = HEX.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ------------------------------------------------------------
// Canvas sizing
// Returns the CSS-pixel size and reports whether the backing
// store had to be reallocated, which is the signal that any
// cached layer needs rebuilding.
// ------------------------------------------------------------
export function syncSize(canvas, ctx) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));

  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  const changed = canvas.width !== targetW || canvas.height !== targetH;

  if (changed) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr, changed };
}

// ------------------------------------------------------------
// Fading trail layer
// A transparent offscreen canvas that is gently erased each
// frame. Cheaper and smoother than re-stroking a long point
// history, and it composites cleanly over any background.
// ------------------------------------------------------------
export function createTrailLayer(w, h, dpr) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const layer = {
    canvas,
    ctx,
    // Resizing a canvas clears it, which would throw away a rosette
    // that took a minute to draw. The old bitmap is stretched into
    // the new one instead, so a window resize — or the detail view
    // settling into its final size — keeps the history.
    resize(nextW, nextH, nextDpr) {
      const targetW = Math.max(1, Math.round(nextW * nextDpr));
      const targetH = Math.max(1, Math.round(nextH * nextDpr));
      const hadContent = canvas.width > 1 && canvas.height > 1;

      let carried = null;
      if (hadContent) {
        carried = document.createElement("canvas");
        carried.width = canvas.width;
        carried.height = canvas.height;
        carried.getContext("2d").drawImage(canvas, 0, 0);
      }

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (carried) ctx.drawImage(carried, 0, 0, targetW, targetH);
      ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
    },
    // destination-out erases alpha, so the trail stays transparent
    // rather than accumulating a tint of the background colour.
    fade(amount) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${amount})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
    clear() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
    blitTo(target) {
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.drawImage(canvas, 0, 0);
      target.restore();
    }
  };

  layer.resize(w, h, dpr);
  return layer;
}

// ------------------------------------------------------------
// Drawing helpers
// ------------------------------------------------------------
export function clearFrame(ctx, w, h, color = LAB.space) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function glowDot(ctx, x, y, radius, color, blur = 16) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function halo(ctx, x, y, radius, color, strength = 0.5) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, strength));
  gradient.addColorStop(0.45, rgba(color, strength * 0.28));
  gradient.addColorStop(1, rgba(color, 0));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Deterministic faint starfield — ties each simulation back to the
// homepage without pulling focus from the physics.
export function makeStars(count, seed = 7) {
  let s = seed;
  function rand() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  }
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: rand(), y: rand(), r: rand() * 0.9 + 0.25, a: rand() * 0.35 + 0.08 });
  }
  return stars;
}

export function drawStars(ctx, stars, w, h) {
  ctx.save();
  ctx.fillStyle = LAB.ink;
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    ctx.globalAlpha = star.a;
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function label(ctx, text, x, y, color = LAB.muted, size = 10) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "DM Sans", system-ui, sans-serif`;
  ctx.letterSpacing = "0.12em";
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

export function arrow(ctx, x1, y1, x2, y2, color, width = 1.2, head = 5) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 6),
    y2 - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 6),
    y2 - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// ------------------------------------------------------------
// Runner
// Drives one simulation. Preview instances throttle their draw
// rate and pause when scrolled out of view, so a grid of four
// costs far less than four full-rate loops.
// ------------------------------------------------------------
export function createRunner(sim, canvas, options = {}) {
  const drawFps = options.drawFps || 0;
  const drawInterval = drawFps > 0 ? 1000 / drawFps : 0;
  const autoPause = options.autoPause !== false;

  let raf = 0;
  let last = 0;
  let running = false;
  let visible = true;
  let enabled = true;
  let drawAcc = 0;
  let observer = null;

  function loop(now) {
    raf = requestAnimationFrame(loop);

    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05);

    sim.step(dt);

    if (drawInterval > 0) {
      drawAcc += dt * 1000;
      if (drawAcc < drawInterval) return;
      drawAcc = 0;
    }
    sim.draw();
  }

  function start() {
    if (running || !visible || !enabled) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if (autoPause && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      function (entries) {
        const entry = entries[0];
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);
  }

  // Fast-forwards the simulation so a card opens on an established
  // state — a drawn-out rosette, a built-up cycloid — rather than on
  // a blank frame at t = 0. Drawing periodically rather than only at
  // the end lets trail layers fade naturally on the way through.
  function warmup(seconds) {
    const stepSize = 1 / 60;
    const steps = Math.round(seconds / stepSize);
    const drawEvery = 15;

    for (let i = 0; i < steps; i++) {
      sim.step(stepSize);
      if (i % drawEvery === 0) sim.draw();
    }
    sim.draw();
  }

  return {
    start,
    stop,
    warmup,
    // Hard gate used while the detail view is open: without it a
    // stray IntersectionObserver callback (a resize, say) would
    // quietly restart every preview behind the modal.
    setEnabled(value) {
      enabled = value;
      if (!enabled) stop();
    },
    get running() {
      return running;
    },
    dispose() {
      stop();
      if (observer) observer.disconnect();
      if (sim.dispose) sim.dispose();
    }
  };
}
