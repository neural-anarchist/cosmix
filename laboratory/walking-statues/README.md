# Walking Statues

A Cosmix Laboratory instrument for the walking-Moai hypothesis: can a tall
rigid statue advance by controlled side-to-side rocking? Forward motion is
never scripted here — it has to emerge from rigid-body dynamics, gravity,
ground contact, friction, and rope forces, or it doesn't happen at all.

**Status: Phase 1 of 5, plus a force/contact correction.** App shell, flat
road, a free rigid-body statue with two base geometries (flat rectangular /
lateral cylindrical rocker), an explicit rope-anchor model, validated static
equilibrium, and a physics diagnostics panel. See [PLAN.md](./PLAN.md) for the
roadmap and what's landed, and [PHYSICS_MODEL.md](./PHYSICS_MODEL.md) for
exactly what's simulated versus approximated versus not modeled — including
two genuine findings Phase 1 turned up: why the cylindrical-rocker base rolls
away instead of rocking unless actively controlled, and why Rapier's applied
forces silently compound if you don't reset them
([full audit](./PHASE1_FORCE_CONTACT_AUDIT.md)).

**What this does and does not show.** Phase 1 validates contact, static
equilibrium, sliding, and lateral rocking. It does *not* demonstrate directed
forward walking, and a symmetric base on a symmetric flat road is not expected
to: measured forward progress is 0.15 mm against 0.63 m of lateral motion.
Directed walking needs fore-aft asymmetric geometry and asymmetric contact
transfer, which is Phase 2 and beyond.

## Setup

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173/`).

Other scripts:

```bash
npm run build      # type-check + production build
npm run typecheck   # type-check only
npm test            # unit tests (vitest)
```

## What's here right now

- A perspective 3D viewport (Three.js) with orbit controls, a flat road with
  a centerline and boundary markers, and a procedurally-built statue —
  currently a simple box-torso/sphere-head stand-in on either a flat
  rectangular base (A0) or a lateral cylindrical rocker base (A4).
- Rapier3D (WASM) rigid-body physics: gravity, friction, contact, and
  explicit per-collider mass/density, stepped at a fixed 1/240 s regardless
  of display frame rate.
- An explicit rope model: each rope runs from a hauler position you can place
  anywhere in the world to an attachment point on the statue, and the force
  direction is derived from that geometry rather than being a fixed axis. A
  rope can only pull. All twelve coordinates are editable, and the rendered
  rope, the force arrow, the diagrams and the numbers all come from the same
  solution — so the picture cannot disagree with the physics.
- Live readouts: sim time, forward/lateral displacement of the COM, roll,
  pitch, rope tensions, regime, governing threshold, contact count, reported
  mass/COM height.
- A collapsible **Physics Diagnostics** panel: predicted sliding and tipping
  thresholds (both the classical formulas and geometry-aware versions for the
  actual rope direction), applied force and torque about the COM per rope,
  velocities against the quantified rest tolerances, contact count, friction
  settings, and a plan-view and rear-elevation diagram of the rope layout and
  torque arm.
- Two **validation benchmarks** you can run from the page: a static
  equilibrium check (hold 50% of the governing threshold for 5 s and require
  the statue not to move, to stated tolerances) and a force ramp from 0 to
  125% that reports the observed motion onset against the analytic
  prediction and classifies it as sliding or rocking.
- Collider-overlay and center-of-mass-marker toggles, so the actual
  (deliberately coarse) collision geometry is always inspectable, never
  hidden behind the display mesh.
- A second page section deriving the rigid-body equations of motion, the
  fixed-timestep integration method, and — because the two Phase 1 base
  families have genuinely different stability physics — both a static
  tipping-angle result (flat base) and a rolling-stability result
  (cylindrical rocker), rendered with KaTeX and illustrated by a live SVG
  diagram driven by the running simulation.

## Known limitations (Phase 1)

All of these are deliberate scope boundaries, documented in detail in
[ARCHITECTURE.md](./ARCHITECTURE.md) ("What Phase 1 deliberately does not
build yet") and [PHYSICS_MODEL.md](./PHYSICS_MODEL.md):

- Only 2 of the 17 specified base geometry families are implemented (A0,
  A4). The rest are visible-but-disabled options in the UI, not silently
  substituted.
- The torso/head are simple primitives, not the tapered procedural Moai
  silhouette.
- Only direct manual rope control exists — no alternating protocols (P0–P5),
  no PD feedback control.
- Only a flat road. No slope, concavity, or roughness.
- No time-series recording, charts, work/energy accounting, presets,
  export, batch sweeps, or calibration workflow.
- Regime classification is instantaneous and kinematic, not the full
  configurable failure-state taxonomy the project spec calls for (which needs
  run history).
- A held rope is an ideal constant-tension force: rope compliance and slack
  are not modeled, so a rope that should have gone limp keeps pulling.
- Left/right pulls mirror to about 1%, not exactly, because Rapier's contact
  constraint ordering is not itself mirror-symmetric. Measured and bounded in
  PHYSICS_MODEL.md rather than hidden.

None of this is hidden behind a claim of completeness — the in-app copy,
this README, PLAN.md, and PHYSICS_MODEL.md all say so explicitly, and the
UI marks unimplemented base families as disabled rather than silently
falling back to something else.

## Project structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full module map and the
reasoning behind the coordinate-convention and engine-loop design
decisions.
