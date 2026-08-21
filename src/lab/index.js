// ============================================================
// LABORATORY PAGE CONTROLLER
// Builds the grid of live previews, and opens any card into a
// full instrument view with controls and readouts.
//
// Previews and the detail view are separate simulation instances.
// Moving one canvas between layouts would mean resizing and
// reseeding mid-flight; building a fresh instance is simpler and
// lets the grid stay paused while the detail view is open.
// ============================================================
import { createRunner } from "./core.js";
import { SIMULATIONS, findSimulation } from "./registry.js";

const grid = document.querySelector("#lab-grid");
const overlay = document.querySelector("#lab-detail");
const detailCanvas = document.querySelector("#detail-canvas");
const detailTitle = document.querySelector("#detail-title");
const detailKicker = document.querySelector("#detail-kicker");
const detailNote = document.querySelector("#detail-note");
const detailControls = document.querySelector("#detail-controls");
const detailReadouts = document.querySelector("#detail-readouts");
const detailClose = document.querySelector("#detail-close");
const detailPlay = document.querySelector("#detail-play");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const previews = [];
let detail = null;
let readoutTimer = 0;
let lastFocused = null;

// ------------------------------------------------------------
// Preview grid
// ------------------------------------------------------------
function buildCard(config) {
  // Entries with an href are full pages of their own, so they render as real
  // links — middle-click and "open in new tab" then work as expected.
  const isLink = Boolean(config.href);
  const card = document.createElement(isLink ? "a" : "button");
  card.className = "lab-card";
  card.style.setProperty("--accent", config.accent);

  if (isLink) {
    card.href = config.href;
    card.setAttribute("aria-label", `${config.title} — open the full instrument`);
  } else {
    card.type = "button";
    card.setAttribute("aria-label", `Open ${config.title}`);
  }

  card.innerHTML = `
    <span class="lab-card-frame">
      <canvas class="lab-card-canvas"></canvas>
      <span class="lab-card-open">${isLink ? "Full instrument →" : "Open ↗"}</span>
    </span>
    <span class="lab-card-body">
      <span class="lab-card-kicker">${config.kicker}</span>
      <span class="lab-card-title">${config.title}</span>
      <span class="lab-card-blurb">${config.blurb}</span>
    </span>
  `;

  if (!isLink) {
    card.addEventListener("click", function () {
      openDetail(config.id, card);
    });
  }

  return card;
}

function mountPreviews() {
  SIMULATIONS.forEach(function (config) {
    const card = buildCard(config);
    grid.appendChild(card);

    const canvas = card.querySelector(".lab-card-canvas");

    // The canvas needs its laid-out size before the simulation can
    // seed itself, so construction waits a frame.
    requestAnimationFrame(function () {
      const sim = config.create(canvas, { preview: true });
      const runner = createRunner(sim, canvas, { drawFps: 30 });

      previews.push({ sim, runner, canvas });

      // Fast-forward first so the card never shows an empty t = 0
      // frame, then either animate on or hold that composed state.
      if (config.warmup) runner.warmup(config.warmup);
      if (!reducedMotion) runner.start();

      const observer = new ResizeObserver(function () {
        sim.draw();
      });
      observer.observe(canvas);
    });
  });
}

// ------------------------------------------------------------
// Controls
// ------------------------------------------------------------
function buildControl(control, sim) {
  const row = document.createElement("div");
  row.className = "control-row";

  if (control.type === "button") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.textContent = control.label;
    button.addEventListener("click", function () {
      sim.set(control.id, true);
      // A reset can restore other parameters (the diffusion barrier,
      // for one), so pull the panel back in step.
      syncControls(sim);
    });
    row.appendChild(button);
    return row;
  }

  const label = document.createElement("label");
  label.className = "control-label";
  const labelId = `control-${control.id}`;
  label.setAttribute("for", labelId);
  label.textContent = control.label;

  if (control.type === "range") {
    const value = document.createElement("span");
    value.className = "control-value";
    value.textContent = formatValue(control.value, control.unit);
    label.appendChild(value);

    const input = document.createElement("input");
    input.type = "range";
    input.id = labelId;
    input.className = "control-range";
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = control.value;

    input.addEventListener("input", function () {
      const next = Number(input.value);
      value.textContent = formatValue(next, control.unit);
      sim.set(control.id, next);
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  if (control.type === "toggle") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = labelId;
    input.className = "control-toggle";
    input.checked = !!control.value;
    input.addEventListener("change", function () {
      sim.set(control.id, input.checked);
    });

    row.classList.add("control-row-inline");
    row.appendChild(input);
    row.appendChild(label);
    return row;
  }

  if (control.type === "select") {
    const select = document.createElement("select");
    select.id = labelId;
    select.className = "control-select";

    control.options.forEach(function (option) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    });

    select.value = control.value;
    select.addEventListener("change", function () {
      sim.set(control.id, select.value);
      // A preset can rewrite other controls, so mirror the new state
      // back into the panel rather than letting it drift.
      syncControls(sim);
    });

    row.appendChild(label);
    row.appendChild(select);
    return row;
  }

  return row;
}

function formatValue(value, unit) {
  const number = Number(value);
  const text = Number.isInteger(number) ? String(number) : number.toFixed(2);
  return unit ? `${text}${unit}` : text;
}

// Mirrors the simulation's live values back into the panel. Needed
// because a preset rewrites several parameters at once, and the
// sliders would otherwise keep showing the values they had before.
function syncControls(sim) {
  if (!sim.controls || !sim.values) return;
  const values = sim.values();

  sim.controls.forEach(function (control) {
    if (!(control.id in values)) return;
    const input = detailControls.querySelector(`#control-${control.id}`);
    if (!input) return;

    const value = values[control.id];

    if (control.type === "range") {
      input.value = value;
      const readout = input.parentElement.querySelector(".control-value");
      if (readout) readout.textContent = formatValue(value, control.unit);
    } else if (control.type === "toggle") {
      input.checked = !!value;
    } else if (control.type === "select") {
      input.value = String(value);
    }
  });
}

function renderReadouts(sim) {
  if (!sim.readouts) return;
  const items = sim.readouts();

  if (detailReadouts.children.length !== items.length) {
    detailReadouts.innerHTML = items
      .map(function () {
        return `<div class="readout"><span class="readout-label"></span><span class="readout-value"></span></div>`;
      })
      .join("");
  }

  items.forEach(function (item, index) {
    const node = detailReadouts.children[index];
    node.querySelector(".readout-label").textContent = item.label;
    node.querySelector(".readout-value").textContent = item.value;
  });
}

// ------------------------------------------------------------
// Detail view
// ------------------------------------------------------------
function openDetail(id, trigger) {
  const config = findSimulation(id);
  if (!config) return;

  closeDetail(false);
  lastFocused = trigger || document.activeElement;

  previews.forEach(function (preview) { preview.runner.setEnabled(false); });

  detailTitle.textContent = config.title;
  detailKicker.textContent = config.kicker;
  overlay.style.setProperty("--accent", config.accent);
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");

  const sim = config.create(detailCanvas, { preview: false });
  const runner = createRunner(sim, detailCanvas, { autoPause: false });

  detailNote.textContent = sim.note || "";
  detailNote.style.display = sim.note ? "" : "none";

  detailControls.innerHTML = "";
  (sim.controls || []).forEach(function (control) {
    detailControls.appendChild(buildControl(control, sim));
  });

  detailReadouts.innerHTML = "";
  renderReadouts(sim);

  const observer = new ResizeObserver(function () {
    sim.draw();
  });
  observer.observe(detailCanvas);

  detail = { sim, runner, config, observer };

  // Warm up on the next frame, once the overlay has been laid out.
  // Running it immediately would build the trail at the canvas's
  // pre-layout size, and the resize that follows would rescale it.
  requestAnimationFrame(function () {
    if (!detail || detail.runner !== runner) return;
    runner.warmup(config.warmup || 0);

    if (reducedMotion) {
      setPlayState(false);
    } else {
      runner.start();
      setPlayState(true);
    }
  });

  readoutTimer = window.setInterval(function () {
    renderReadouts(sim);
  }, 200);

  if (window.location.hash !== `#${id}`) {
    history.replaceState(null, "", `#${id}`);
  }

  detailClose.focus();
}

function setPlayState(playing) {
  detailPlay.textContent = playing ? "Pause" : "Play";
  detailPlay.setAttribute("aria-pressed", String(playing));
}

function closeDetail(restoreFocus = true) {
  if (!detail) return;

  window.clearInterval(readoutTimer);
  detail.observer.disconnect();
  detail.runner.dispose();
  detail = null;

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("detail-open");

  detailControls.innerHTML = "";
  detailReadouts.innerHTML = "";

  previews.forEach(function (preview) {
    preview.runner.setEnabled(true);
    if (!reducedMotion) preview.runner.start();
  });

  if (history.replaceState) {
    history.replaceState(null, "", window.location.pathname);
  }

  if (restoreFocus && lastFocused) {
    lastFocused.focus();
    lastFocused = null;
  }
}

detailClose.addEventListener("click", function () { closeDetail(); });

detailPlay.addEventListener("click", function () {
  if (!detail) return;
  if (detail.runner.running) {
    detail.runner.stop();
    setPlayState(false);
  } else {
    detail.runner.start();
    setPlayState(true);
  }
});

overlay.addEventListener("click", function (event) {
  if (event.target === overlay) closeDetail();
});

window.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && detail) {
    event.preventDefault();
    closeDetail();
  }
});

// Pause everything while the tab is hidden.
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    previews.forEach(function (preview) { preview.runner.stop(); });
    if (detail) detail.runner.stop();
  } else if (!reducedMotion) {
    if (detail) {
      detail.runner.start();
      setPlayState(true);
    } else {
      previews.forEach(function (preview) { preview.runner.start(); });
    }
  }
});

// ------------------------------------------------------------
mountPreviews();

// Deep link: /laboratory/#crossed-fields opens that instrument. Entries that
// are their own page have nothing to open in the modal, so they are skipped.
const initial = window.location.hash.replace("#", "");
const initialConfig = initial ? findSimulation(initial) : null;
if (initialConfig && !initialConfig.href) {
  requestAnimationFrame(function () {
    openDetail(initial, null);
  });
}
