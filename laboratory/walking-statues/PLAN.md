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

**Phase 1: complete and validated**, including the force/contact correction.
Committed as the preserved baseline (`feat(walking-statues): validate static
contact, tipping, and rope geometry`).

**Phase 2: Steps 1-3 of 6 complete.** Procedural upper body and mass model
(Step 1); twelve-family base-geometry factory on a shared parameter schema, with
fore-aft mirror generation (Step 2); matched-comparison mode (Step 3). See the completion notes at the bottom of
this file, and
[PHASE2_GEOMETRY_AND_CONTROL.md](./PHASE2_GEOMETRY_AND_CONTROL.md) for the
model description. Steps 2–6 have not started; per the development order this
project is built against, each step is verified before the next begins.

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


---

## Phase 2 — Step 1 completion notes

Procedural upper body and mass model. Build, typecheck and **67 tests** pass
(39 preserved from Phase 1, 28 new).

**Phase-1 preservation, done first and separately:**
- All seven validated Phase 1 benchmark results are now automated tests. The
  zero-damping static equilibrium check was the only one still living in a
  throwaway probe; it is now a regression test, because Step 1 changes the
  mass model and that baseline needed locking in code first.
- Every Phase 1 regression now points at `PHASE1_BASELINE_STATUE_PARAMS`, a
  frozen copy of the exact configuration that was validated, rather than at
  `DEFAULT_STATUE_PARAMS`. Defaults may evolve; what the regressions certify
  may not.
- A permanent, non-dismissible scope notice sits under the viewport in the app
  stating that A0/A4 on a flat symmetric road are validation models, that
  forward motion is never imposed, the 0.15 mm vs 0.63 m negative-control
  baseline, the 5% mirror bound, and what a walking claim must survive. Its
  numbers come from `benchmark/baseline.ts`, the same constants the code will
  judge against, so the figure shown and the figure enforced cannot drift.

**What shipped in Step 1:**
- Procedural Moai upper body from Three.js primitives and a hand-built
  tapered-box buffer geometry — tapered torso, arm relief, shoulder shelf, and
  a head with brow ridge, nose, eye sockets, lips and ears. No external mesh,
  scan, download or texture.
- `torsoTaper`: a real mechanical parameter (changes the collider cross-section
  and inertia), zero of which reproduces the Phase 1 box exactly.
- `forwardLeanDeg`: intrinsic lean of the *upper body only*, pivoting at the
  base top so ground contact is unaffected. Reported separately from dynamic
  pitch everywhere.
- Explicit COM override with honest labelling as an abstract probe.
- `visualDetail`: tessellation-only, with a test proving it cannot reach the
  physics.
- Per-component collider overlay, colour-coded, each with its approximation
  stated in the diagnostics panel.

**Verified in the browser, not just compiled:** components labelled and
colour-coded; lean 18° reported as intrinsic 18.00° / dynamic 0.004°; COM moved
to x = 0.367 m with the base still flat on the road; the static-equilibrium
benchmark still PASSES on a leaned and tapered statue; taper 0 reproduces
COM z = 1.648 m; COM override lands exactly on 1.050 m for z/H = 0.3; visual
detail low→high leaves mass, COM and inertia byte-identical; zero console
errors.

**Known limitation carried forward:** the head is 12% of total height, inherited
from the Phase 1 baseline. Real Moai heads are nearer a third, but changing it
moves the rope attachment height that feeds the validated tipping threshold, so
it is deliberately left for an explicit regression-tested change rather than
being altered as a side effect of a visual improvement.

### Manual test checklist (Step 1)

- [ ] The statue reads as a Moai: tapered body, arms at the sides, blocky head
      with a brow ridge and long nose.
- [ ] "Show collider overlay" reveals exactly three primitives, coloured blue
      (base) / gold (torso) / rust (head), and the diagnostics list each one's
      collision approximation.
- [ ] Setting "Torso taper" and "Forward lean" both to 0 reports mass 4000 kg
      and COM z = 1.648 m — the validated Phase 1 body.
- [ ] Increasing "Forward lean" tilts the upper body forward while the base
      stays flat on the road; intrinsic lean and dynamic pitch are reported as
      separate numbers.
- [ ] Increasing "Torso taper" visibly narrows the torso and changes the
      reported inertia, but not the total mass.
- [ ] Enabling "Override COM explicitly" turns the COM marker violet and the
      diagnostics label it an abstract probe; the COM lands exactly on the
      requested z/H x H.
- [ ] Changing "Tessellation" low/medium/high changes nothing in the readouts.
- [ ] "Run static equilibrium benchmark" still PASSES with taper and lean
      applied.
- [ ] `npm run build`, `npm run typecheck`, `npm test` all exit clean.

---

## Phase 2 — Step 2 completion notes

**What shipped in Step 2:**

- **Twelve base families**, all implemented, none placeholders: A0, A1, A2, A3,
  A4, A5, B0, B2, B3, B4, B5, B6. The UI groups them as symmetric A-series
  (validation and reference geometry) and fore-aft asymmetric B-series
  (candidates), because that distinction is scientific rather than cosmetic.
- **One shared normalized parameter schema** of eleven parameters, with each
  family *declaring* which it reads. Controls a family ignores are disabled with
  the reason shown, and both sets are listed by symbol in the diagnostics panel.
- **Invariants asserted by test**: `W_base` is always the maximum lateral width
  and `L_base` always the total fore-aft length, for every family and every
  asymmetry setting; the asymmetry controls split an extent rather than adding to
  it. Out-of-range values in parameters a family does not read are ignored rather
  than rejected, so one parameter set can be carried across families.
- **Fore-aft mirror generation.** B3 is generated as B2's exact reflection, not
  hand-written to resemble one — verified identical to 0.0 m across all 37
  stations. `foreAftMirrorParams` returns null where no exact mirror exists
  (B0, B4, B6), and the UI flags those families, rather than returning something
  mirror-shaped that is not a mirror.
- **Raw mass/COM/inertia diagnostics**: per-component target mass, assumed
  volume, the collider's own volume, density and resulting mass, plus the
  independently-computed analytic COM beside Rapier's with the disagreement in
  millimetres and a flag when it exceeds 1 mm.
- **The plan-view diagram draws the real outline**, and distinguishes a
  flat family's contact footprint from a rocker's plan silhouette. The
  theory-section diagram now reads its base dimensions and contact kind from the
  same geometry the physics is built from, instead of testing for A4 by name.

**The defect found and fixed during Step 2:**

Rapier keeps at most four solver contacts per collider pair. For a convex
polyhedron resting face-down, its point selection could collapse the contact
patch — measured at 39 mm on a 0.43 m base — leaving the statue balanced on a
stamp, injecting energy, and climbing 10-35 mm *with nothing pulling on it*.
Five of the new families would not stand still, and B2 and B3 — exact mirrors —
behaved 30x differently. A0 never showed it because box-versus-box has a
specialised contact path, so a phase of validation on A0 could not have caught
it.

Fixed structurally, not by tuning: degenerate sub-nanometre footprint edges are
collapsed, and flat-bottomed bases are handed to the solver as eight wedge
colliders whose union is exactly the original solid. No damping was added, no
motion clamped, no geometry changed. The wedge count came from a convergence
study (4 -> 4.1 mm, 6 -> 2.8 mm, 8 -> 0.00 mm, 12 -> 0.09 mm, 16 -> 0.02 mm
against a 0.5 mm tolerance).

**Tests: 418 total, all passing** — the 67 from Phase 1 and Step 1 unchanged,
plus 351 new. New files: `bases/polytope.test.ts`, `bases/footprints.test.ts`,
`bases/baseFamilies.test.ts`, `bases/mirror.test.ts`,
`bases/contactStability.test.ts`.

| Required Step 2 test | Where |
|---|---|
| Every base-family parameter validator | `baseFamilies.test.ts` — each family, each parameter it reads, driven out of range and to NaN |
| Mass/COM calculation | `baseFamilies.test.ts` — total mass, base mass fraction, analytic-vs-Rapier COM, per family |
| Base-family mirror transformation | `mirror.test.ts` — fore-aft and lateral, including which families have no exact mirror |
| B2/B3 geometrically mirrored | `mirror.test.ts` — half-width profile, bounds, centroid, volume |
| A0 Phase-1 static equilibrium still passes | `benchmark/staticEquilibrium.test.ts` (unchanged) and `contactStability.test.ts` across all families |
| Zero rope tension remains at rest | `contactStability.test.ts` — every family, 3 s and 10 s |
| Geometry construction | `polytope.test.ts`, `footprints.test.ts` |

### Manual test checklist (Step 2)

Verified in headless Chromium against the dev server, zero console errors:

- [x] All twelve families selectable and buildable; each reports total mass
      4000.00 kg and base extents exactly 0.770 x 1.120 m.
- [x] Every family stands at REST — 0.000 mm/s and 0.0000 deg/s after settling.
- [x] Analytic-vs-Rapier COM agreement: 0.000 mm for ten families, 0.72 mm for
      A5 and 0.019 mm for B5 (the hull faceting deficit, displayed not hidden).
- [x] Collider overlay draws the eight wedges for flat families and the
      lofted solid for rockers — the colliders, not the display mesh.
- [x] Parameter greying is per family: A0 shows 4 of 11 active, B6 shows 7,
      A5 shows 4 with base height correctly disabled.
- [x] B6 at 14 deg reports intrinsic lean 14.00 deg split as 0.00 from the body
      and 14.00 from the base, separate from dynamic pitch.
- [x] B2 labels its plan view "contact footprint"; A5 labels it "plan
      silhouette (rocker)" and draws the contact line.
- [x] Mirror status shown per family, with B0/B4/B6 flagged "NO EXACT MIRROR
      CONTROL".

### What Step 2 did not do

No family has been run as a walking candidate. Step 2 built and validated the
geometry; whether any of it changes the response to the validated rope forces is
Step 4's question, and nothing here has measured it.

---

## Phase 2 — Step 3 completion notes

**What shipped in Step 3:**

- **Raw Geometry versus Matched Comparison**, with a permanent banner reading
  `RAW GEOMETRY — not a controlled performance comparison`,
  `MATCHED COMPARISON — all required locks satisfied`, or
  `MATCHED COMPARISON INVALID — one or more constraints cannot be met`.
- **Six named presets** — Raw Geometry, Matched Envelope, Matched Mass + COM,
  Matched Mass + COM + Width, Matched Volume + Width, Matched Moai Candidate
  Trial — plus sixteen individual locks in advanced mode.
- **A read-only report table** giving every lock's target, achieved value,
  absolute and relative error, status and **the method used**, alongside the
  environment quantities (rope anchors and attachments, tension limit, road,
  timestep/solver, initial pose) and the recomputed principal inertia.
- **Internal ballast** for COM matching: a labelled mass applied through Rapier's
  additional mass properties, so no collider changes and contact behaviour is
  provably unaffected. Drawn in the collider overlay in its own colour with its
  own toggle.
- **A baseline/candidate scenario workflow** with a `comparisonGroupId` carried
  into exports, so a later result can be tied to the exact constraints it was
  run under.
- **Environment drift detection**: a locked road, rope, tension or solver setting
  changed after the baseline was captured invalidates the comparison and names
  the quantity and both values.

**Two defects found and fixed during Step 3:**

- Ballast containment was tested against the statue's bounding box, which for a
  wide-based statue is mostly empty air at shoulder height. B0's ballast was
  placed 9 cm outside the torso and reported as internal. Containment now walks
  the real base footprint polygon, the leaned torso box and the head sphere; the
  bounding-box case is kept as a regression test.
- Environment drift was recomputed only when the statue changed, so nudging the
  road-friction slider after capturing a baseline silently invalidated a
  comparison that still displayed as matched. Drift is now recomputed from every
  setter that can touch a lockable quantity.

**Tests: 613 total, all passing** — the 418 from Phase 1 and Steps 1-2 unchanged,
plus 195 new across `comparison/resolve.test.ts`,
`comparison/scenario.test.ts` and `statue/envelope.test.ts`.

| Required Step 3 test | Where |
|---|---|
| Raw mode alters nothing | `resolve.test.ts` — every family, params and Rapier-measured mass/COM/inertia |
| Matched mode changes only locked quantities | `resolve.test.ts` |
| Disabling matched mode restores raw exactly | `resolve.test.ts` |
| Width / length / height locks within tolerance | `resolve.test.ts`, all flat families |
| W_base stays maximum width, L_base stays total length | `resolve.test.ts`, all families, two presets |
| Mass and COM locks for A0/A2/B0/B2/B3/B5/B6 | `resolve.test.ts`, measured through Rapier |
| Ballast positive, inside the body, no invalid density | `resolve.test.ts`, `envelope.test.ts` |
| B2/B3 mirror preserved under every preset | `resolve.test.ts` |
| Environmental locks (road, ropes, tension, solver, pose) | `scenario.test.ts` |
| Invalid constraints rejected, not approximated | `resolve.test.ts` — five cases |

### Manual test checklist (Step 3)

Verified in headless Chromium against the dev server, zero console errors:

- [x] A0 baseline captured in Raw Geometry — banner reads RAW GEOMETRY.
- [x] B0 under Matched Mass + COM + Width — all locks MET, ballast 199.0 kg at
      (0.241, 0, 1.648) m.
- [x] B2 under Matched Moai Candidate Trial — all locks MET, ballast 175.6 kg at
      x = -0.241 m.
- [x] B3 mirrored control under the same trial — all locks MET, ballast 175.6 kg
      at x = +0.241 m, achieved values byte-identical to B2's.
- [x] B5 under Matched Envelope — INVALID, naming the unreachable base height and
      the range B5 can actually produce (0.595-1.619 m).
- [x] A4 under Matched Envelope — INVALID, "a cylindrical rocker is as tall as it
      is wide".
- [x] Ballast marker visible in the collider overlay, distinct from the COM
      marker, with a working toggle.
- [x] Scenario workflow: capture baseline and candidate, switch away, load each
      back — statue and environment restored, shared configuration retained.
- [x] Environment drift: changing road friction after capture flips the banner to
      INVALID and names the quantity.

### What Step 3 did not do

It runs no experiments, measures no displacement, applies no control, and says
nothing about walking. It makes a fair comparison possible.
