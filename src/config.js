// ============================================================
// COSMIX — CENTRAL CONFIGURATION
// All world data and scene tuning constants live here so the
// scene modules stay purely structural.
// ============================================================

// --- Palette (kept in sync with assets/css/style.css) ---
export const PALETTE = {
  space: 0x070b14,
  spaceSoft: 0x111a2c,
  ink: 0xf4efe5,
  gold: 0xd7b470,
  blue: 0x83b8d7,
  violet: 0x9b6bff,
  rust: 0xd68c70
};

// --- Renderer / post-processing tuning ---
export const RENDER = {
  fov: 48,
  near: 0.1,
  far: 400,
  exposure: 1.0,
  fogDensity: 0.006,
  maxPixelRatio: 1.75,
  minPixelRatio: 0.75,
  bloom: {
    strength: 0.7,
    radius: 0.6,
    threshold: 0.55
  },
  vignette: 0.85,
  grain: 0.045
};

// --- Camera framing ---
export const CAMERA = {
  home: { x: 0, y: 7.5, z: 26 },
  // Pushes the rendered system right of centre on wide screens so it
  // never sits on top of the hero type. Cleared on narrow screens,
  // where the hero moves to the bottom instead.
  viewShift: 0.17,
  viewShiftMinWidth: 900,
  minDistance: 4,
  maxDistance: 60,
  minPolarAngle: Math.PI * 0.08,
  maxPolarAngle: Math.PI * 0.86,
  flyDuration: 1200,
  focusDistanceFactor: 5.5,
  focusMinDistance: 2.4
};

// --- The star at the centre ---
export const SUN = {
  id: "about",
  label: "About Cosmix",
  kicker: "The centre · About us",
  radius: 1.05,
  description:
    "Cosmix is a fantasy physics olympiad academy — built for students who want to train for USAPhO through mock exams, a model library, and interactive simulations, all wrapped in a living cosmic map."
};

export const TEAM = {
  id: "team",
  label: "Our Team",
  kicker: "The centre · Our team",
  description:
    "Cosmix is built by a small team of physics students and designers who believe olympiad training can feel like an adventure, not a chore."
};

// --- Worlds ---
// Sizes roughly doubled and orbits respaced so each planet reads
// clearly instead of crowding its neighbour.
export const WORLDS = [
  {
    id: "observatory",
    label: "The Observatory",
    kicker: "First orbit · Models",
    description:
      "Clear physics models and conceptual tools for seeing the structure beneath difficult problems.",
    color: PALETTE.gold,
    atmosphere: 0xffd9a0,
    size: 0.62,
    orbitRadius: 4.5,
    orbitSpeed: 0.25,
    orbitTilt: 0.05,
    startAngle: 0.4,
    spin: 0.01,
    style: "crystal"
  },
  {
    id: "trials",
    label: "The Trials",
    kicker: "Second orbit · Mock exams",
    description:
      "Timed mock USAPhO exams designed for deliberate practice, review, and measurable growth.",
    color: PALETTE.rust,
    atmosphere: 0xff9e78,
    size: 0.7,
    orbitRadius: 6.5,
    orbitSpeed: 0.17,
    orbitTilt: 0.09,
    startAngle: 2.1,
    spin: 0.004,
    style: "mars"
  },
  {
    id: "laboratory",
    label: "The Laboratory",
    kicker: "Third orbit · Simulations",
    description:
      "Interactive models that turn abstract laws into systems you can adjust, observe, and test.",
    color: PALETTE.blue,
    atmosphere: 0xa8d8ff,
    size: 0.82,
    orbitRadius: 8.5,
    orbitSpeed: 0.11,
    orbitTilt: 0.03,
    startAngle: 4.0,
    spin: 0.008,
    style: "rings",
    moon: { size: 0.16, distance: 1.9, speed: 0.9, color: 0xd5d8df }
  },
  {
    id: "frontier",
    label: "The Frontier",
    kicker: "Fourth orbit · Archive",
    description: "Problem sets and solutions from past Cosmix competitions.",
    color: 0xd5d8df,
    atmosphere: PALETTE.violet,
    size: 0.46,
    orbitRadius: 11,
    orbitSpeed: 0.08,
    orbitTilt: 0.12,
    startAngle: 5.4,
    spin: 0.0015,
    style: "station"
  }
];

// --- Starfield layers (near → far) ---
export const STAR_LAYERS = [
  { count: 1400, innerRadius: 20, outerRadius: 55, size: 1.9, drift: 0.00035, opacity: 1.0 },
  { count: 2200, innerRadius: 55, outerRadius: 110, size: 1.3, drift: 0.00018, opacity: 0.85 },
  { count: 3000, innerRadius: 110, outerRadius: 190, size: 0.9, drift: 0.00008, opacity: 0.6 }
];

// --- Nebula ---
// Wisps are large additive quads, so their fill cost is the main
// budget here — kept further out and fewer in number rather than
// big and close, which is where overdraw gets expensive.
export const NEBULA = {
  shellRadius: 260,
  wispCount: 140,
  wispInner: 48,
  wispOuter: 165,
  wispMinScale: 16,
  wispMaxScale: 42,
  driftSpeed: 0.012
};
