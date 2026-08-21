// ============================================================
// COSMIX — SCENE ORCHESTRATOR
// Builds the renderer and wires the scene modules together.
// Everything visual lives in ./scene/*, all tuning in ./config.js
// ============================================================
import * as THREE from "three";

import { RENDER, CAMERA, WORLDS, SUN, PALETTE } from "./config.js";
import { createNebula } from "./scene/nebula.js";
import { createStars } from "./scene/stars.js";
import { createSun } from "./scene/sun.js";
import { createWorlds } from "./scene/planets.js";
import { createCameraRig } from "./scene/camera.js";
import { createLabels } from "./scene/labels.js";
import { createComposer } from "./scene/post.js";
import { createPanel } from "./ui/panel.js";
import { createHeroTypewriter } from "./ui/hero-typewriter.js";

// ------------------------------------------------------------
// Which page are we on? Section pages render only their own world.
// ------------------------------------------------------------
const segments = window.location.pathname.split("/").filter(Boolean);
const lastSegment = segments[segments.length - 1] || "";
const activeId = WORLDS.some(function (w) { return w.id === lastSegment; })
  ? lastSegment
  : null;

// ------------------------------------------------------------
// Renderer
// ------------------------------------------------------------
const canvas = document.querySelector("#cosmos");
const overlay = document.querySelector("#overlay-root") || document.body;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});

let pixelRatio = Math.min(window.devicePixelRatio, RENDER.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = RENDER.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.space, RENDER.fogDensity);

const camera = new THREE.PerspectiveCamera(
  RENDER.fov,
  window.innerWidth / window.innerHeight,
  RENDER.near,
  RENDER.far
);

// Bias the rendered frame so the system sits right of centre and the
// hero column stays clear. A negative x view offset shows the region
// left of the frame, which pushes the contents right on screen.
function applyViewShift() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (width < CAMERA.viewShiftMinWidth) {
    camera.clearViewOffset();
    return;
  }

  camera.setViewOffset(
    width,
    height,
    -width * CAMERA.viewShift,
    0,
    width,
    height
  );
}
applyViewShift();

// ------------------------------------------------------------
// Scene assembly
// ------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x8aa3c9, 0.8));

// Cool fill from the camera side so night-facing hemispheres read as
// dark blue rather than as holes punched in the nebula.
const fill = new THREE.DirectionalLight(0x9fc0e8, 0.55);
fill.position.set(3, 5, 8);
scene.add(fill);

const nebula = createNebula(scene);
const stars = createStars(scene, pixelRatio);
const sun = createSun(scene);
const worlds = createWorlds(scene, activeId);

const rig = createCameraRig(camera, renderer.domElement);
const labels = createLabels(worlds.entries, overlay);
const post = createComposer(renderer, scene, camera);

// ------------------------------------------------------------
// Motion preference
// ------------------------------------------------------------
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionQuery.matches;

const motionToggle = document.querySelector("#motion-toggle");

function syncMotionToggle() {
  if (!motionToggle) return;
  motionToggle.textContent = reducedMotion ? "Enable motion" : "Reduce motion";
  motionToggle.setAttribute("aria-pressed", String(reducedMotion));
}
syncMotionToggle();

if (motionToggle) {
  motionToggle.addEventListener("click", function () {
    reducedMotion = !reducedMotion;
    syncMotionToggle();
  });
}

// Follow the OS preference if it changes mid-session.
motionQuery.addEventListener("change", function (event) {
  reducedMotion = event.matches;
  syncMotionToggle();
});

// ------------------------------------------------------------
// Panel + selection
// ------------------------------------------------------------
// Section pages sit one directory deep, so sibling links need "../".
const panel = createPanel(
  {
    onClose() {
      rig.goHome();
    }
  },
  activeId ? "../" : "./"
);

const focusPoint = new THREE.Vector3();

function select(entry) {
  panel.open(entry.world);
  entry.group.getWorldPosition(focusPoint);
  rig.focusOn(focusPoint, entry.world.size);
}

function selectSun() {
  panel.open(SUN);
  rig.focusOn(focusPoint.set(0, 0, 0), SUN.radius * 1.6);
}

// ------------------------------------------------------------
// Pointer interaction
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
let pointerDownAt = null;

function pickTargets() {
  return worlds.pickTargets.concat(sun.pickTargets);
}

function updatePick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets(), true);
  if (hits.length === 0) return null;

  let node = hits[0].object;
  while (node) {
    if (node.userData && node.userData.world) return node;
    node = node.parent;
  }
  return null;
}

function setPointerFromEvent(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

canvas.addEventListener("pointermove", function (event) {
  setPointerFromEvent(event);
  hovered = updatePick();

  canvas.style.cursor = hovered ? "pointer" : "grab";
  worlds.setHover(hovered);
});

canvas.addEventListener("pointerdown", function (event) {
  pointerDownAt = { x: event.clientX, y: event.clientY };
});

// Listening on the canvas rather than window means header and hero
// buttons no longer fire a raycast underneath themselves.
canvas.addEventListener("pointerup", function (event) {
  if (!pointerDownAt) return;
  const moved =
    Math.abs(event.clientX - pointerDownAt.x) +
    Math.abs(event.clientY - pointerDownAt.y);
  pointerDownAt = null;

  // Treat it as a drag, not a click, if the pointer travelled.
  if (moved > 6) return;

  setPointerFromEvent(event);
  const hit = updatePick();
  if (!hit) return;

  if (hit.userData.isSun) {
    selectSun();
    return;
  }

  const entry = worlds.findByGroup(hit);
  if (entry) select(entry);
});

// ------------------------------------------------------------
// Keyboard navigation
// ------------------------------------------------------------
let cursorIndex = -1;

window.addEventListener("keydown", function (event) {
  const entries = worlds.entries;
  if (entries.length === 0) return;

  if (event.key === "Escape") {
    if (panel.isOpen) panel.close();
    return;
  }

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    cursorIndex = (cursorIndex + 1) % entries.length;
    worlds.setHover(entries[cursorIndex].group);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    cursorIndex = (cursorIndex - 1 + entries.length) % entries.length;
    worlds.setHover(entries[cursorIndex].group);
  } else if (event.key === "Enter" && cursorIndex >= 0) {
    event.preventDefault();
    select(entries[cursorIndex]);
  }
});

// ------------------------------------------------------------
// Touch affordance
// Touch devices never fire hover, so idle-cycle the highlight to
// show the worlds are selectable.
// ------------------------------------------------------------
const isTouch = window.matchMedia("(hover: none)").matches;
let idleTimer = 0;
let idleIndex = 0;

// ------------------------------------------------------------
// Explore button
// ------------------------------------------------------------
const exploreButton = document.querySelector("#explore-button");
if (exploreButton) {
  exploreButton.addEventListener("click", function () {
    if (panel.isOpen) panel.close();
    rig.sweep();
  });
}

// ------------------------------------------------------------
// Section pages open their own world immediately.
// ------------------------------------------------------------
if (activeId) {
  const entry = worlds.findById(activeId);
  if (entry) panel.open(entry.world);
}

// ------------------------------------------------------------
// Resize
// ------------------------------------------------------------
window.addEventListener("resize", function () {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  applyViewShift();
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  post.setSize(width, height);
  labels.setSize(width, height);
});

// ------------------------------------------------------------
// Adaptive resolution + tab-visibility pause
// ------------------------------------------------------------
let frameSamples = [];
let lastAdapt = 0;

function adaptResolution(now, frameMs) {
  frameSamples.push(frameMs);
  if (frameSamples.length < 60 || now - lastAdapt < 3000) return;

  const average =
    frameSamples.reduce(function (a, b) { return a + b; }, 0) / frameSamples.length;
  frameSamples = [];
  lastAdapt = now;

  if (average > 22 && pixelRatio > RENDER.minPixelRatio) {
    pixelRatio = Math.max(RENDER.minPixelRatio, pixelRatio - 0.25);
  } else if (average < 12 && pixelRatio < Math.min(window.devicePixelRatio, RENDER.maxPixelRatio)) {
    pixelRatio = Math.min(
      Math.min(window.devicePixelRatio, RENDER.maxPixelRatio),
      pixelRatio + 0.25
    );
  } else {
    return;
  }

  renderer.setPixelRatio(pixelRatio);
  stars.setPixelRatio(pixelRatio);
  post.setSize(window.innerWidth, window.innerHeight);
}

let paused = false;
document.addEventListener("visibilitychange", function () {
  paused = document.hidden;
  lastTime = performance.now();
});

// ------------------------------------------------------------
// Animation loop
// ------------------------------------------------------------
const clock = new THREE.Clock();
let lastTime = performance.now();

// Animation time advances only while motion is enabled, so reduced
// motion holds a fully composed frame instead of freezing mid-tween.
let animTime = 0;

function animate() {
  const now = performance.now();
  const frameMs = now - lastTime;
  lastTime = now;

  if (paused) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  const moving = !reducedMotion;
  if (moving) animTime += delta;

  nebula.update(animTime);
  stars.update(animTime, moving ? delta : 0);
  sun.update(animTime, delta, moving);
  worlds.update(animTime, delta, moving);
  rig.update(delta);
  labels.update(camera);
  post.update(animTime);

  // Touch idle cycle.
  if (isTouch && !panel.isOpen && worlds.entries.length > 1) {
    idleTimer += delta;
    if (idleTimer > 2.4) {
      idleTimer = 0;
      idleIndex = (idleIndex + 1) % worlds.entries.length;
      worlds.setHover(worlds.entries[idleIndex].group);
    }
  }

  post.render();
  labels.render(scene, camera);

  adaptResolution(now, frameMs);
}

renderer.setAnimationLoop(animate);

// ------------------------------------------------------------
// Reveal once the first frame is on screen.
// ------------------------------------------------------------
const heroTypewriter = createHeroTypewriter();

requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    document.body.classList.add("is-ready");
    heroTypewriter.start();
  });
});
