# ARCHITECTURE — Walking Statues

## Design goals

1. **Physics is the source of truth.** Nothing in the render path may write
   a position, rotation, or velocity into a body. The only writes to a rigid
   body are forces/torques (and, at reset, a full re-initialization). The
   render layer only *reads* physics state.
2. **Visual geometry and collision geometry are different objects**, built
   by the same factory call but never sharing a mesh.
3. **The physics/render loop is framework-agnostic.** It does not depend on
   React. React mounts a canvas, renders control panels, and reads a
   throttled snapshot of simulation state. This keeps the door open for a
   future MuJoCo-WASM backend to be swapped in behind the same engine
   interface without touching UI code.
4. **Every geometry family, road mode, and pulling protocol is a registry
   entry behind a small interface**, not a growing switch statement, so
   Phases 2–5 add modules instead of editing existing ones.

## Coordinate convention

The spec requires x = forward, y = lateral, z = vertical, with roll about x
and pitch about y. Three.js and Rapier are both axis-agnostic — "Y-up" is
only a convention, not a constraint — so rather than keep the simulation in
one frame and rotate everything for display, **the entire app uses the
simulation's z-up, x-forward, y-lateral frame natively**, in both Rapier and
Three.js:

- Rapier gravity is set directly as `(0, 0, -9.81)`.
- The Three.js camera's `up` vector is set to `(0, 0, 1)`; `OrbitControls`
  (three r150+) derives its orbit basis from `camera.up`, so orbiting
  behaves correctly without extra bookkeeping.
- The road plane lies in the XY plane at z = 0, extended along x.
- A Rapier rigid body's `translation()`/`rotation()` is copied *directly*
  onto the corresponding `THREE.Object3D.position`/`.quaternion` every
  frame — no coordinate-swap matrix anywhere in the codebase.

This eliminates an entire class of "which axis did I mean" bugs at the cost
of being non-default for Three.js newcomers reading the code; it is called
out here and at the top of `src/core/constants.ts` for exactly that reason.

Roll and pitch for the readout/metrics layer are extracted from the body's
quaternion via an `'XYZ'`-ordered Three.js Euler decomposition, read off
directly as `roll = euler.x`, `pitch = euler.y`, `yaw = euler.z` — see
`src/core/orientation.ts`. Euler decomposition is an approximation that
degenerates near gimbal lock (±90° about the middle axis); this is acceptable
because the statue's failure thresholds
(±35° pitch by default) are reached and the run is flagged as fallen long
before that region, but it is documented here and in PHYSICS_MODEL.md
because it is exactly the kind of simplification the project spec asks not
to hide. Separating the statue's *intrinsic* forward lean (a modeling
parameter baked into the base geometry, landing with base family B6 in
Phase 2) from *dynamic* pitch (the live simulated tilt) is a Phase 2+
concern; Phase 1 runs with zero intrinsic lean, so raw quaternion pitch and
dynamic pitch coincide.

## Module map

Physics is deliberately separated from rendering at every level, so the whole
simulation can be built and stepped headlessly in Node. That separation is
load-bearing rather than tidiness: the Phase 1 force-latch defect (see
PHYSICS_MODEL.md) survived a full phase of manual testing partly because there
was no way to assert on the physics without a WebGL context. Files marked
**[headless]** import neither Three.js nor a canvas.

```
src/
  core/
    constants.ts        SI constants, fixed timestep, gravity vector
    orientation.ts      quaternion -> {roll, pitch, yaw}                  [headless]
    vec3.ts             plain-object vector/quaternion math               [headless]
    SimulationEngine.ts owns THREE renderer/scene/camera + Rapier world;
                        runs the accumulator loop; the framework-agnostic
                        heart of the app (see below)
  physics/
    rapierSetup.ts      async RAPIER.init() wrapper, memoized
    thresholds.ts       F_slide / F_tip, reference and geometry-aware;
                        static tipping angle                              [headless]
    types.ts            shared physics-facing types
  road/
    types.ts            RoadParams, RoadBuild
    body.ts             road collider only, top face at z = 0             [headless]
    flatRoad.ts         body.ts + the Three.js road visual
  statue/
    types.ts            StatueParams, StatueBuild, BaseFamilyId
    defaults.ts         default StatueParams
    geometry.ts         all scalar geometry: base dims, torso taper, lean
                        placements, analytic COM, COM override, default
                        rope attachments                                  [headless]
    body.ts             the compound rigid body + colliders, per-component
                        labelling, and the explicit COM override          [headless]
    procedural.ts       Moai display geometry from primitives only
    factory.ts          body.ts + display meshes, per-component collider
                        overlay, COM marker
    bases/
      types.ts          BaseGeometryModule: dims / colliderDescs / visual
      registry.ts       id -> module map; unimplemented ids throw a clear
                        "not implemented in this phase" error rather than
                        silently falling back
      a0-flatRect.ts, a4-lateralRocker.ts
  control/
    ropeModel.ts        two-point rope geometry -> direction, force, torque [headless]
    ropeDefaults.ts     default haul geometry; purely-lateral arrangement   [headless]
    ropeForces.ts       resets Rapier's force/torque latch, then applies    [headless]
  diagnostics/
    tolerances.ts       quantified rest tolerances + regime thresholds      [headless]
    regime.ts           REST/STICKING/SLIDING/ROCKING/TOPPLING/AIRBORNE     [headless]
  benchmark/
    baseline.ts         the frozen Phase 1 negative-control constants     [headless]
    harness.ts          full statue-on-road sim with no renderer, driving
                        the production force path                          [headless]
    staticEquilibrium.ts  the static equilibrium benchmark                 [headless]
    forceRamp.ts        0 -> 125% ramp, onset detection + classification    [headless]
  state/
    store.ts            Zustand store: params, rope geometry, UI toggles,
                        and a throttled readout snapshot written by the engine
  ui/
    Viewport.tsx        mounts the canvas, owns SimulationEngine lifecycle
    ControlPanel.tsx    statue / base / road+contact parameters
    RopeControls.tsx    the twelve rope coordinates + tension
    ReadoutPanel.tsx    headline readouts
    BaselineNotice.tsx  permanent statement of what the model does not show
    DiagnosticsPanel.tsx  collapsible Physics Diagnostics
    BenchmarkPanel.tsx  runs the two validation experiments
    diagrams/           TopViewDiagram, SideViewDiagram
    theory/             KaTeX theory section + live rocking diagram
  styles/
    global.css          Cosmix palette + layout, page chrome matching the
                        rest of the laboratory
  App.tsx, main.tsx
```

## The engine loop

`SimulationEngine` is a plain class, not a React component. It:

1. Owns the Rapier `World`, the Three.js `Scene`/`Camera`/`WebGLRenderer`,
   the current `RoadBuild`, and the current `StatueBuild`.
2. Runs a single `requestAnimationFrame` loop that:
   - accumulates wall-clock time,
   - steps Rapier at a **fixed** `dt` (default 1/240 s) in a `while
     (accumulator >= dt)` loop — never once per render frame,
   - stores the pre-step and post-step transform of the tracked body each
     physics step,
   - renders every animation frame, with the visual transform linearly
     interpolated (`lerp` for position, `slerp` for the quaternion) between
     the last two physics states using `alpha = accumulator / dt`, so
     visual motion stays smooth even if the render rate and 240 Hz physics
     rate don't divide evenly.
3. Inside the fixed-step loop (once per physics step, never once per render
   frame): solves each rope's geometry, **resets Rapier's persistent
   force/torque latch**, then applies the rope forces at their attachment
   points via `addForceAtPoint`. The reset is not optional — Rapier's
   `addForce*` calls accumulate into a latch that `world.step()` never clears,
   so omitting it makes a held force grow without bound and persist after
   release. See `control/ropeForces.ts` and PHYSICS_MODEL.md.
4. Publishes a throttled snapshot (~20 Hz) to the Zustand store for the
   React readout panel. Physics itself is never gated on React.

This class is the seam where a future MuJoCo-WASM backend would plug in: a
`PhysicsBackend` interface (step, body query, force application) is *not*
extracted in Phase 1 — doing so before there is a second implementation
would be speculative — but `SimulationEngine` already isolates all Rapier
calls behind its own methods, so extracting that interface later is a
mechanical refactor, not a redesign. This is noted here rather than
implemented, per the spec's "keep the architecture ready... but do not
implement MuJoCo yet."

## Statue factory contract

Physics and rendering are built in two layers. `statue/body.ts` builds the
simulated body and needs no scene:

```ts
createStatueBody(params, RAPIER, world, friction, restitution) => {
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  geometry: StatueGeometry;   // all scalars, from statue/geometry.ts
}
```

`statue/factory.ts` wraps that with display objects:

```ts
createStatue(params, ctx, friction, restitution) => {
  visual: THREE.Group;          // procedural mesh, display only
  colliderVisual: THREE.Group;  // wireframe proxies of the actual colliders
  comMarker: THREE.Object3D;    // small marker at the reported COM
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  geometry: StatueGeometry;
  dispose(): void;              // removes meshes from scene, body from world
}
```

Mass properties are never set directly: each collider gets a density computed
from its target sub-mass and its analytic volume, and Rapier derives the
aggregate mass, COM and inertia. `statue/geometry.test.ts` cross-checks the
analytic COM against Rapier's own `worldCom()` for both base families, so a
density or volume error cannot pass silently.

Base families implement `BaseGeometryModule`, split across three methods plus a
required `colliderApproximation` string, so the physics never needs the renderer
and every family must state how its collider approximates its visual:

- `dims(params): BaseDims` — pure scalars, including `contactHalfWidthY` (the
  tipping lever arm `b`) and `contactKind` (`"flat" | "rocker"`). The
  threshold math consumes this rather than branching on family id.
- `colliderDescs(params, RAPIER): ColliderDesc[]` — collision geometry only.
- `visual(params): THREE.Object3D` — display geometry only.

All three derive from `dims`, so collision and display geometry cannot drift
apart. Adding a base family is: implement the interface in `bases/<id>.ts`,
register it in `bases/registry.ts`. Nothing else in the codebase branches on
base family id.

## Rope model

A rope is two points and nothing else: an external anchor fixed in the world
(where the haulers stand) and an attachment fixed in the body. Direction is
derived every step as `normalize(external - attachment)`, force is `T * d̂`
applied at the attachment, and torque about the COM follows from
`(p_att - r_COM) x F`. This makes the model tension-only by construction.

The important architectural property is that there is **one** geometry. The
solver, the rendered rope line, the force arrow, the top/side diagnostic
diagrams, and the numeric readouts all consume the same `RopeSolution`. The
Phase 1 model failed here in a way worth recording: it applied a hardcoded
world-space force while the render path fabricated its own unrelated rope
line, so the picture and the physics disagreed and the picture was the only
thing a user could check against.

## What Phase 1 deliberately does not build yet

Named here so it's unambiguous rather than discovered by absence:

- Only A0 and A4 base families (rest are Phase 2+, per the spec's own
  phase ordering).
- Torso/head are simple primitives, not the tapered/lathe-generated Moai
  silhouette (Phase 2).
- No pulling *protocols* (P0–P5) — only direct manual hold-to-pull forces.
  P1/P3 land in Phase 2.
- No road types beyond flat.
- No charts, no time-series recording, no energy/work accounting, no presets,
  no export, no sweeps, no calibration.
- Regime classification is *instantaneous and kinematic*
  (REST/STICKING/SLIDING/ROCKING/TOPPLING/AIRBORNE), not the full failure
  taxonomy the spec calls for (no-motion / slip / lateral escape / fore-aft
  fall / lateral fall / numerical warning), which needs run history rather
  than a single frame. Phase 2.
- No accordion/basic-vs-advanced UI split yet — controls are grouped into
  plain sections that map 1:1 onto the eventual accordion groups, so the
  Phase-3+ UI pass is a wrapping change, not a rewrite.

## Testing

`npm test` runs 38 Vitest tests. The physics ones build real Rapier worlds in
Node via `benchmark/harness.ts`, which drives the *same* geometry, force model
and stepping order the app's engine uses — so they test the production path
rather than a reimplementation of it.

- `core/orientation.test.ts` — quaternion -> roll/pitch/yaw.
- `core/vec3` is exercised throughout the others.
- `control/ropeModel.test.ts` — direction derivation, tension-only property,
  torque about the COM, rotation tracking, degenerate zero-length rope.
- `physics/thresholds.test.ts` — reference formulas, the identity that the
  geometry-aware forms collapse onto them for a purely lateral pull, governing
  mode switching, rocker special-casing, mirror symmetry.
- `statue/geometry.test.ts` — mass partitioning, stacking, parameter
  validation, and the analytic-vs-Rapier COM cross-check.
- `benchmark/staticEquilibrium.test.ts` — the static equilibrium benchmark,
  the force ramp's threshold reproducibility, and sliding-vs-rocking flipping
  correctly with friction. Includes a deliberate **negative control** that
  reintroduces the un-reset force latch and asserts the statue *does* run
  away, so the main regression test cannot quietly stop testing anything.
- `benchmark/mirrorSymmetry.test.ts` — force direction genuinely derived from
  geometry, analytic torque, and mirrored left/right trajectories to a
  documented tolerance.

The remaining suites the spec asks for (work integration, failure
classification, seeded roughness, CSV/JSON round-trip) arrive with those
subsystems in Phases 3–5.
