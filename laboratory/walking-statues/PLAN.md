# PLAN — Walking Statues

A Cosmix Laboratory instrument studying the walking-Moai hypothesis: can a
tall rigid statue advance by controlled side-to-side rocking, driven only by
rigid-body dynamics, gravity, friction, ground contact, and applied rope
forces? No keyframed motion, no scripted forward displacement — every step
must emerge from the physics.

This is a large, multi-phase build. This file tracks the roadmap end to end
and is updated with a completion note and manual test checklist after every
phase. Work proceeds strictly in phase order; a phase does not start until
the previous one builds cleanly and passes its manual checklist.

## Stack

Vite + React + TypeScript, Three.js for rendering, Rapier3D (`@dimforge/
rapier3d-compat`, the WASM-async-init build that plays well with bundlers)
for rigid-body physics, Zustand for the state store that bridges the
physics/render loop and the React control panels. No backend — the built
app is a static bundle, consistent with the rest of Cosmix. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries and the reasoning
behind each choice.

This sits inside the existing `cosmix` static site (`laboratory/<sim>/`
convention) but is its own self-contained npm project — no other Cosmix
simulation uses a build step, and this one needs WASM physics and 3D
rendering that the vanilla-canvas approach can't give it. The page chrome
(header, section nav, KaTeX theory sections, dark palette) mirrors the
existing simulations; the internals do not.

## Phases

### Phase 1 — Foundations (current target)
- App shell (Vite + React + TS), dev server running.
- Three.js scene: perspective camera, orbit controls, lighting, flat road
  plane. Z-up world (matches the required x-forward/y-lateral/z-vertical
  convention directly — see ARCHITECTURE.md).
- Flat rigid road only.
- One free 6-DOF rigid body in Rapier.
- Base families A0 (flat rectangular prism) and A4 (lateral cylindrical
  rocker), through a base-factory abstraction designed to accept the
  remaining families without rework.
- Fixed-timestep (1/240 s) Rapier stepping via an accumulator loop, decoupled
  from render framerate; render-time interpolation between physics states.
- Manual left/right rope-force controls (press-and-hold buttons + magnitude
  slider), applied as forces at anchor points on the body — no direct
  velocity or position edits.
- Basic readouts: Δx, Δy, roll, pitch, sim time, instantaneous rope forces.
- COM marker and collider-visibility toggle pulled forward from Phase 2
  because they are cheap and necessary for verifying the rigid body is
  behaving correctly during this phase's own manual testing.

### Phase 2 — Statue, protocols, metrics
- Full procedural statue factory: tapered torso, head, facial silhouette,
  visible base, built from Three.js primitive/lathe/extrude geometry, kept
  strictly separate from the compound collision geometry.
- Base families A5 (ellipsoidal/spherical rocker), B0 (D-base), B2
  (forward-rounded teardrop), B6 (Moai-inspired D-base with adjustable
  forward lean).
- Compound colliders with explicit mass distribution, COM, and inertia
  reporting.
- P1 (alternating half-sine pulses) and P3 (angle-triggered PD control with
  slack-rope handling and a rear safety rope) pulling protocols.
- Time-series recording at a configurable sample rate; charts for x(t),
  y(t), roll/pitch(t), rope tension(t).
- Explicit failure-state classification (no-motion, slip, lateral escape,
  fore/aft fall, lateral fall, numerical warning) with the green/yellow/
  orange/red/gray status model.

### Phase 3 — Metrics, presets, comparison
- Work/energy accounting: signed and positive rope work, kinetic + potential
  energy, energy residual, cost-of-transport metric.
- Contact-force/impulse proxies, slip ratio, lateral drift.
- All ten required scenario presets.
- JSON scenario export, CSV time-series and summary export.
- Matched-comparison mode (hold mass/height/base width/COM/etc. fixed across
  geometries).
- Concave road mode.

### Phase 4 — Sweeps and sensitivity
- Web Worker batch-sweep runner: 1D/2D grid sweeps, heat maps (Δx/H,
  positive work, peak tension, failure probability, lateral drift).
- Pareto view (work/(MgΔx) vs. success probability) and the explicit
  user-weighted objective `J`.
- Seeded multi-trial architecture (Sobol/LHS-ready, not necessarily
  implemented) for later uncertainty work.
- Timestep-convergence check (dt vs dt/2 comparison with a 5% warning
  threshold).

### Phase 5 — Calibration and polish
- Calibration workflow: CSV import for measured force/pose data, overlay
  plots against simulation, documented calibration sequence.
- Optional three-rope mode, optional deterministic rough-road mode.
- Full unit test suite (parameter validation, base-profile generation, COM,
  waveform generation, work integration, failure classification, seeded
  roughness, CSV/JSON round-trip) and at least one browser-level smoke test.
- Documentation pass: README, ARCHITECTURE, PHYSICS_MODEL,
  PARAMETER_REFERENCE, CALIBRATION_GUIDE, EXPERIMENT_PROTOCOL all brought
  up to date and cross-checked against the actual implementation.

## Status

**Phase 1: complete, plus a force/contact correction — build, typecheck and
tests all passing.** See "Phase 1 — completion notes" for the original build
and "Phase 1 correction" at the bottom of this file for the force-model fix,
which is the current state.

Phase 2 has not started. Per the development-order instructions this
project was built against, Phase 2 does not begin until Phase 1 has been
reviewed and confirmed working.

---

## Phase 1 — completion notes

Built and verified: `npm run typecheck`, `npm run build`, and `npm test`
all pass clean. The app was also driven end-to-end in a real headless
Chromium session (navigate, hold-to-pull both ropes, toggle collider/COM
overlays, switch base families, inspect the theory section) rather than
just type-checked — see the manual checklist below, all of which was
exercised this way at least once.

**What shipped, beyond the Phase 1 checklist in the plan above:**
- Live rope lines + force-vector arrows (part of the spec's rope-model
  "Version 1", not deferred).
- Collider-overlay and COM-marker toggles, pulled forward from Phase 2 as
  noted above.
- A second page section ("Rocking Geometry & Theory") with real KaTeX-
  rendered derivations and a live SVG diagram, matching the rest of
  Cosmix's simulation-page structure, scoped to exactly what Phase 1
  implements (no protocol or energy-accounting theory yet, since those
  subsystems don't exist).

**Bugs found and fixed during manual verification (not left for later):**
- `SimulationEngine.onResize()` crashed (`Cannot set properties of
  undefined`) if the viewport's `ResizeObserver` fired before the async
  Rapier WASM init finished — fixed with an `initialized` guard.
- The status chip permanently stuck on "gray / not started" after any
  Reset or parameter-driven rebuild, because `rebuildStatue()` was
  clearing the `everStarted` flag on every rebuild even though the sim
  kept running — fixed by only ever setting that flag in `start()`.
- The default preset (A4, the cylindrical rocker, with statue-scale
  proportions) turned out to be a passively *unstable* equilibrium — see
  PHYSICS_MODEL.md for the derivation. Verified as real physics (5 s
  perfectly stable with zero input, confirming it's a genuine unstable
  equilibrium rather than numerical noise) rather than a bug, then changed
  the default preset to A0 and added the finding to the theory section
  instead of masking it.

**Known rough edges intentionally not fixed in Phase 1** (see
ARCHITECTURE.md "What Phase 1 deliberately does not build yet" for the
full, larger list): the camera's default framing doesn't automatically
adjust if the statue height slider moves it far from the default 3.5 m;
holding a rope button for too long can easily drive A0 well past its
tipping angle or send A4 rolling away — both correct given the physics
implemented so far, not guarded against, since guarding against them is
exactly the failure-state classification work scoped for Phase 2.

### Manual test checklist

- [ ] `npm install && npm run dev` starts cleanly; browser shows the page
      without console errors.
- [ ] The 3D viewport renders a road (centerline + boundary stripes) and a
      statue standing on it; camera orbits with drag, zooms with scroll.
- [ ] Sim time in the readout panel increases on its own (physics running
      without any input).
- [ ] Holding "Hold to pull left" applies a visible lateral force (rope
      line + arrow appear, "Left rope" reads a nonzero N matching the
      F_max slider) and the statue visibly rolls; releasing drops the
      force to 0 N.
- [ ] Same for "Hold to pull right", opposite direction.
- [ ] Pulling one side hard enough for long enough on A0 topples it past
      its tipping angle (matches the derivation in the theory section);
      on A4 it eventually rolls away rather than settling back — both are
      expected, not bugs.
- [ ] "Reset" returns the statue to its initial pose and zeroes Δx/Δy/sim
      time without the status chip getting stuck on "Not started".
- [ ] Switching "Base family" between A0 and A4 rebuilds the statue
      (visibly different shape) without a console error; A5/B0/B2/B6 show
      as disabled options, not silently swapped for something else.
- [ ] "Show collider overlay" reveals wireframe primitives that match the
      display mesh's footprint; toggling off hides them again.
- [ ] "Show center-of-mass marker" shows/hides a small marker that tracks
      the reported COM height as the statue rocks.
- [ ] Section 2 renders KaTeX-typeset equations (not raw `$...$` text) and
      a live SVG diagram that updates its roll angle as the statue rocks
      and switches its explanation (tipping angle vs. rolling condition)
      when the base family changes.
- [ ] `npm run build` and `npm test` both exit clean.

---

## Phase 1 correction — force application and static contact

Two defects were reported after Phase 1 review and both were real:

1. A lateral pull below both the static-sliding and static-tipping thresholds
   still rotated the statue if held for several seconds.
2. The rope model pulled purely along world ±y and its on-screen geometry did
   not represent a plausible pulling setup.

Audited before changing anything, in
[PHASE1_FORCE_CONTACT_AUDIT.md](./PHASE1_FORCE_CONTACT_AUDIT.md).

**Root cause of (1):** Rapier's `addForce*` family adds into a persistent
force/torque latch that `world.step()` never clears. The engine applied the
rope force once per fixed step and never called `resetForces`/`resetTorques`,
so a held pull grew as `n × F` — reaching ~92× the statue's weight over a 5 s
hold — and kept acting forever after release while the UI reported 0 N. The
contact model itself needed no change. Fixed with both resets at the top of
every step; not with damping, a clamp, or a lock.

**Root cause of (2):** no external anchor existed in the model at all; the
force direction was a hardcoded constant and the rope drawn on screen was a
separate per-frame fabrication agreeing with neither the force direction nor
any fixed puller position. Replaced with an explicit two-point rope geometry.

### What changed

- `control/ropeForces.ts` — now resets Rapier's force **and** torque latch
  every fixed step before applying. Resetting only forces leaves the spin
  (measured 31× too fast), which is why the bug presented as rotation.
- `control/ropeModel.ts`, `ropeDefaults.ts` — new tension-only rope model:
  external world anchor + body-local attachment, direction derived as
  `normalize(external − attachment)`, force applied at the attachment. Twelve
  user-editable coordinates.
- `physics/thresholds.ts` — `F_slide`/`F_tip` reference formulas plus
  geometry-aware versions for an arbitrary rope direction, and the static
  tipping angle.
- `statue/geometry.ts`, `statue/body.ts`, `road/body.ts` — physics split from
  rendering so the benchmarks and tests can build the *same* body headlessly.
  Base modules split into `dims` / `colliderDescs` / `visual`. This is what
  makes the physics testable at all; the original bug survived a phase of
  manual testing partly because nothing could assert on it without WebGL.
- `benchmark/harness.ts`, `staticEquilibrium.ts`, `forceRamp.ts` — the two
  validation experiments, driving the production force path.
- `diagnostics/` — rest tolerances and instantaneous regime classification
  (REST / STICKING / SLIDING / ROCKING / TOPPLING / AIRBORNE).
- UI — collapsible Physics Diagnostics panel, top-view and side-view
  diagnostic diagrams, rope-geometry controls, benchmark runner. Theory §6
  rewritten for the new rope model and §7 added for the static thresholds.
- Rope visuals now derive from the same solution the solver consumes, so the
  picture cannot disagree with the forces.

### Results

- **Static equilibrium benchmark: PASS.** 50% of the governing threshold held
  5 s → 4.0e-5 m displacement (12× inside the 0.5 mm limit) and 1.2e-3° roll
  (44× inside 0.05°); speed and angular speed 153× and 468× inside theirs.
- **Force ramp: reproducible threshold.** Onset at 100% of the analytic
  prediction, with every level below holding and every level above moving.
- **Sliding vs rocking flips correctly with friction:** μ=0.12 → onset at
  `F_slide` = 4709 N, SLIDING; μ=0.65 and μ=1.20 → onset at `F_tip` = 8969 N,
  ROCKING.
- **Damping is not doing the work:** identical static result with linear and
  angular damping set to zero.
- **Mirror symmetry to ~1%,** limited by Rapier's non-mirror-symmetric
  constraint ordering — documented and bounded, not masked. See
  PHYSICS_MODEL.md.
- Build, typecheck, and 39 tests pass. Verified end-to-end in headless
  Chromium with zero console/page errors.

All seven Phase-1 benchmark results are now locked in as automated tests, so
none of them can regress silently as later phases change geometry:

| Benchmark | Test |
|---|---|
| Static equilibrium @ 50% of governing threshold | `staticEquilibrium.test.ts` |
| Zero-damping static equilibrium | `staticEquilibrium.test.ts` |
| Force-ramp onset reproducibility | `staticEquilibrium.test.ts` |
| High-friction rocking threshold | `staticEquilibrium.test.ts` |
| Low-friction sliding threshold | `staticEquilibrium.test.ts` |
| Left/right mirror symmetry (5% bound) | `mirrorSymmetry.test.ts` |
| A4 rocker NOT APPLICABLE | `staticEquilibrium.test.ts` |

Plus a negative control that reintroduces the un-reset force latch and asserts
the runaway still reproduces, so the main regression cannot quietly stop
testing anything.

### Still true, and stated deliberately

Phase 1 validates contact, static equilibrium, sliding, and lateral rocking.
It does **not** demonstrate directed forward walking, and a symmetric base on
a symmetric flat road is not expected to: measured forward progress is 0.15 mm
against 0.63 m of lateral motion. Directed walking needs fore-aft asymmetric
geometry, COM/lean asymmetry, and asymmetric contact transfer — Phase 2 and
beyond, and never manually imposed translation.

### Manual test checklist (correction)

- [ ] With defaults, "Hold to pull left" for 10 s: the diagnostics show a real
      applied force and a ~2551 N·m torque about the COM, the regime reads
      **STICKING**, and Δx/Δy/roll stay at zero. This is the reported bug.
- [ ] Release: tension drops to 0 N, regime returns to **REST**, and the
      statue does not drift or keep accelerating.
- [ ] Raise tension above the displayed governing threshold (8969 N by
      default) and pull: the statue rocks, regime goes ROCKING then TOPPLING.
- [ ] Drop friction μ to ~0.12 and pull above the new threshold: it slides
      instead of rocking, and the diagnostics show SLIDING governing.
- [ ] Move a hauler's x coordinate: the rendered rope, the force arrow, the
      top-view diagram and the reported `d̂` all change together.
- [ ] "Run static equilibrium benchmark" reports PASS with margins shown.
- [ ] "Run force-ramp test" shows a clean held → moved transition at ~100% of
      prediction.
- [ ] Select base family A4: the benchmark reports NOT APPLICABLE (rocker has
      no tipping lever arm) rather than failing or inventing a number.
- [ ] `npm run build`, `npm run typecheck`, `npm test` all exit clean.
