# PHASE2_GEOMETRY_AND_CONTROL — Walking Statues

Phase 2 builds the geometry and control infrastructure needed to test whether
fore-aft asymmetry, forward lean, COM offset and alternating pulling can produce
**emergent** forward advance. It does not attempt to demonstrate walking, and
nothing in it may impose forward motion.

This document is written incrementally, one step at a time, and states plainly
which sections describe working code and which describe work not yet started.

| Step | Scope | Status |
|---|---|---|
| 1 | Procedural upper body and mass model | **Implemented** |
| 2 | Extensible base-geometry factory (A0–A5, B0, B2–B6) | Not started |
| 3 | Matched-comparison mode | Not started |
| 4 | Geometry-only study mode | Not started |
| 5 | P1 alternating-pulse controller | Not started |
| 6 | P3 angle-triggered feedback controller | Not started |

---

## The standing constraints

These hold for every step and are repeated here because they are the point of
the exercise, not boilerplate:

- Forward displacement may arise **only** from Rapier rigid-body dynamics,
  geometry, gravity, contact, friction and rope forces.
- Nothing may set x position, x velocity, or a forward impulse. Controllers may
  choose rope tensions and nothing else.
- The physics timestep stays at 1/240 s; the world convention stays x forward,
  y lateral, z vertical.
- Ropes keep explicit external anchors, explicit statue-local attachments, and
  tension-only semantics.
- Visual geometry stays separate from collision geometry, and every geometry
  must be inspectable through the collider overlay.

---

## Step 1 — Procedural upper body and mass model

### What the body is made of

The statue is one dynamic Rapier rigid body carrying three colliders. That has
not changed since Phase 1; what changed is that the *visual* is now procedurally
generated Moai-like geometry rather than a box and a sphere, and that taper,
lean and an explicit COM override are now real parameters.

| Component | Collider | Approximation |
|---|---|---|
| Base | Per base family (A0 cuboid, A4 cylinder) | A0 exact; A4 an exact analytic cylinder, not a faceted mesh, so rolling contact is smooth. |
| Torso | One cuboid at the torso's **mean** cross-section | A tapered torso is a rectangular frustum; it is collided as a uniform box of the mean width and depth. At `torsoTaper = 0` this is exact. |
| Head | One sphere of radius `H_head / 2` | The head is drawn as a blocky Moai head with brow, nose, lips and ears; it is collided as an inscribed sphere. Retained unchanged from validated Phase 1. |

Mass is never assigned directly. Each collider receives a density computed from
its target sub-mass and its analytic volume, and Rapier derives the aggregate
mass, COM and inertia tensor. `statue/geometry.ts` computes the same COM
analytically, and `statue/massModel.test.ts` cross-checks the two across ten
configurations — taper, lean, both base families, and skewed mass fractions — so
a density, volume or lean-transform error cannot pass silently.

### Visual mesh versus collider

All display geometry is generated from Three.js primitives and a hand-built
tapered-box buffer geometry in `statue/procedural.ts`. There is no external
mesh, scan, model download or texture anywhere in the project.

The visual carries detail the collider does not: arm relief down the torso
sides, a shoulder shelf, and a head with a heavy brow ridge, long nose, recessed
eye sockets, thin lips and elongated ears. **None of it is simulated.** The
collider overlay draws the three actual primitives, colour-coded — base in blue,
torso in gold, head in rust — with each component's approximation stated in the
diagnostics panel next to it.

Head width and depth are deliberately kept close to the collider sphere's
diameter. A head drawn much wider than the primitive standing in for it would
make the overlay misleading, which is the opposite of what the overlay is for.

`visualDetail` (low / medium / high) changes tessellation only. A unit test
asserts mass, COM, inertia and the collider set are identical across all three
levels, so the good-looking statue and the simulated statue can never be
different objects.

### Torso taper

`torsoTaper` narrows the torso from the shoulders downward:

```
width_bottom = width_top x (1 - taper)
depth_bottom = depth_top x (1 - taper)
```

This is a **mechanical** parameter, not a cosmetic one: it moves real material,
so it changes the collider cross-section and therefore the inertia tensor.
Measured, it lowers about-z inertia while leaving total mass and COM height
untouched (the collider is a uniform cuboid either way, so its centroid stays at
the torso's mid-height). `taper = 0` reproduces the Phase 1 uniform box exactly.

### Intrinsic forward lean versus dynamic pitch

`forwardLeanDeg` rotates **the upper body only** about +y, pivoting at the top
of the base. The base keeps its ground-contact geometry: leaning the whole body
would be indistinguishable from dynamic pitch and would change which part of the
base touches down, which is precisely the confusion this parameter exists to
avoid.

The two are reported separately everywhere:

- **Intrinsic lean** — a geometry parameter, a modelling choice, not a result.
- **Dynamic pitch** — the live simulated fore-aft tilt read off the body's
  quaternion.
- **Upper-body total** — their sum, for convenience.

A statue built leaning 10° and standing perfectly still has 10° of lean and 0°
of dynamic pitch. Conflating them would make a static statue look like it was
falling over.

Lean moves the COM forward by the amount the geometry implies —
`(m_torso·d_torso + m_head·d_head)·sin(lean) / M`, verified against the
closed-form value — lowers it slightly, and carries the rope attachments forward
with the shoulders so the haul geometry follows the body it is tied to.

Lean is expected to matter for walking, and it is exactly the kind of parameter
that could be mistaken for cheating. It is not: it changes where the mass sits,
and then the same unmodified contact and rope physics act on it.

### Explicit COM override

For sweeps where COM is the independent variable rather than a consequence of
shape, `comOverrideEnabled` places the COM at explicit `x/H`, `y/H`, `z/H`
offsets.

Rapier has no "move the COM" call, so this works the only way it can: every
collider's density is set to zero, removing their contribution to the aggregate
entirely, and the whole mass/COM/inertia is supplied as additional mass
properties. Collider **shapes are untouched**, so contact behaviour is
unchanged — a unit test asserts the shapes and translations are identical with
and without the override.

The rotational inertia is deliberately carried over from the derived
configuration rather than also being invented. The parameter set exposes a COM,
not an inertia tensor, and fabricating a tensor to match an arbitrary COM would
silently change the rocking dynamics the sweep is trying to attribute to COM
placement.

**Consequence, stated plainly: an overridden statue is an abstract probe, not a
self-consistent rigid body.** Its mass distribution does not correspond to any
real arrangement of its own geometry. The COM marker turns violet, the
diagnostics label it `EXPLICITLY OVERRIDDEN — abstract probe`, and results
obtained with it should be read as exploring a parameter axis, not as simulating
a buildable statue.

### The frozen Phase 1 baseline

`PHASE1_BASELINE_STATUE_PARAMS` is the exact configuration Phase 1's benchmarks
were validated against: untapered torso, no lean, no COM override. Every Phase 1
regression test points at it rather than at `DEFAULT_STATUE_PARAMS`.

This matters. Defaults are allowed to evolve as the statue model gets richer —
the default now carries a modest taper so it reads as a Moai rather than a
crate — but the validated baseline is not, and pinning the regressions to a
moving default would quietly change what they certify. The baseline reproduces
mass 4000.0 kg and COM height 1.6485 m exactly, asserted by test.

### Step 1 limitations

- **Head proportion is inherited from Phase 1.** `HEAD_HEIGHT_RATIO` is 0.12,
  so the head is 12% of total height. Real Moai heads are nearer a third. Making
  it accurate would move `torsoTopZ` and therefore the rope attachment height
  `z_anchor`, which is an input to the validated tipping threshold — so it is
  deliberately *not* changed here. It should be revisited as an explicit,
  regression-tested change rather than as a side effect of a visual improvement.
- **The torso frustum is collided as a box at its mean cross-section.** A real
  frustum's centroid sits below its mid-height; the box's does not. At the
  default taper the difference is small, but it is an approximation, not an
  identity.
- **The head collider is a sphere inside a blocky head.** Conservative for
  contact (the head does not normally touch anything) but it is a sphere's
  inertia, not a box's.
- **No base geometry has changed yet.** Only A0 and A4 exist; the fore-aft
  asymmetric families that walking would actually require are Step 2.

---

## Steps 2–6 — not yet implemented

Nothing in the code implements these yet, and this document will not describe
them as though it does. When each lands, this file gains:

- **Step 2:** the exact base parameterisation shared by every family, and each
  family's collider approximation.
- **Step 3:** precisely what matched comparison holds fixed and what it allows
  to vary.
- **Step 4:** how forward advance is measured and normalised.
- **Steps 5–6:** the P1 and P3 control laws, and the conditions required before
  a result may be called "walking".

### Current limitations that will still apply

Recorded now because they bound every later result:

- **Ropes are ideal and constant-tension.** No compliance, no slack: a rope that
  should have gone limp keeps pulling.
- **The road is perfectly rigid and flat.** No soil deformation, no roughness,
  no slope.
- **Mirror asymmetry is nonzero.** Rapier's contact-constraint ordering is not
  symmetric under `y → -y`, so mirrored trials agree only to about 1%, bounded
  by a 5% regression threshold. Any forward-advance claim smaller than this
  asymmetry is indistinguishable from solver bias.
- **Contact resolution is engine-dependent.** Rapier's iterative velocity-level
  solver is standard real-time practice, not a validated multibody-dynamics
  tool. The dt-vs-dt/2 convergence check and an eventual cross-check exist to
  quantify how much that matters.
