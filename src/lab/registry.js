// ============================================================
// SIMULATION REGISTRY
// One entry per experiment. The laboratory page builds itself
// from this list, so adding a simulation means adding a module
// and one record here.
// ============================================================
import { LAB } from "./core.js";
import { createFoucault } from "./sims/foucault.js";
import { createStandingWaves } from "./sims/standing-waves.js";
import { createCrossedFields } from "./sims/crossed-fields.js";
import { createDiffusion } from "./sims/diffusion.js";
import { createCradlePreview } from "./sims/cradle-preview.js";
import { createLensPreview } from "./sims/lens-preview.js";
import { createWalkingStatuesPreview } from "./sims/walking-statues-preview.js";

export const SIMULATIONS = [
  {
    id: "foucault",
    title: "Foucault Pendulum",
    kicker: "Rotating frames · Coriolis",
    blurb:
      "A pendulum keeps swinging in a fixed plane while the Earth turns beneath it. " +
      "Change latitude and watch the precession follow sin λ — vanishing at the equator.",
    accent: LAB.gold,
    // Seconds of simulation to fast-forward before the card is shown,
    // so each preview opens mid-story instead of on an empty frame.
    warmup: 30,
    create: createFoucault
  },
  {
    id: "standing-waves",
    title: "Strings",
    kicker: "Waves · Musical acoustics",
    blurb:
      "Two travelling waves running in opposite directions add to a wave that goes " +
      "nowhere. Opens a full instrument: the ideal string, then fretted geometry, " +
      "bending stiffness and amplitude-dependent tension, compared in cents.",
    accent: LAB.blue,
    warmup: 0.35,
    // A full page rather than a modal: it carries four models, its own charts,
    // a model comparison and the theory behind each departure from the ideal.
    href: "./standing-waves/",
    create: createStandingWaves
  },
  {
    id: "crossed-fields",
    title: "Crossed E × B Fields",
    kicker: "Electromagnetism · Lorentz force",
    blurb:
      "One integrator, three classic regimes: the closed cyclotron circle, the " +
      "drifting cycloid, and the velocity selector that passes only v = E/B.",
    accent: LAB.violet,
    warmup: 11,
    create: createCrossedFields
  },
  {
    id: "diffusion",
    title: "Diffusion & Mixing",
    kicker: "Statistical mechanics · Entropy",
    blurb:
      "Two gases separated by a barrier. Every collision is reversible, yet the " +
      "mixture only ever goes one way — the arrow of time, from counting alone.",
    accent: LAB.rust,
    // Past the 2.5 s barrier release, so the card shows mixing rather
    // than two tidy separated halves.
    warmup: 9,
    create: createDiffusion
  },
  {
    id: "cradle",
    title: "Magnetic Pendulum Cradle",
    kicker: "Coupled oscillators · Normal modes",
    blurb:
      "Pendulums carrying magnets trade energy back and forth. Opens a full " +
      "instrument with a spring–mass analog and live normal-mode analysis.",
    accent: LAB.gold,
    warmup: 6,
    // This one is a full page rather than a modal: it has its own controls,
    // theory, and a second synchronized visualization further down.
    href: "./cradle/",
    create: createCradlePreview
  },
  {
    id: "thick-lens",
    title: "Bottle Lens",
    kicker: "Optics · Thick lens & concentration",
    blurb:
      "A bottle of water is a thick lens with four refracting surfaces. Opens a " +
      "full instrument: vector ray tracing, aberration analysis, and a heating model.",
    accent: LAB.blue,
    warmup: 1.2,
    // A full page rather than a modal: it carries its own controls, plots,
    // parameter sweep, and theory.
    href: "./thick-lens/",
    create: createLensPreview
  },
  {
    id: "walking-statues",
    title: "Walking Statues",
    kicker: "Rigid-body dynamics · Rope & contact",
    blurb:
      "Can a rocked statue walk itself forward? A real rigid-body model — " +
      "gravity, ground contact, friction, and rope tension, nothing scripted — " +
      "tests the walking-Moai hypothesis edge by edge.",
    accent: LAB.rust,
    warmup: 2,
    // A full page of its own: a 3D Rapier/Three.js instrument with rope
    // controls, physics diagnostics, and derivations, built independently
    // and dropped in as a standalone bundle.
    href: "./walking-statues/dist/",
    create: createWalkingStatuesPreview
  }
];

export function findSimulation(id) {
  return SIMULATIONS.find(function (sim) { return sim.id === id; }) || null;
}
