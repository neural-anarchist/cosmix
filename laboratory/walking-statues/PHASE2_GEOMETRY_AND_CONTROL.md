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
| 2 | Extensible base-geometry factory (A0–A5, B0, B2–B6) | **Implemented** |
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

## Step 2 — Extensible base-geometry factory

Twelve base families, all built from one shared parameter schema, one shared
construction path, and one shared set of invariants.

| Family | Contact | Shape |
|---|---|---|
| A0 | flat | Rectangular prism. The validated Phase 1 reference. |
| A1 | flat | Rounded rectangular prism; plan corners rounded by `r_edge`. |
| A2 | flat | Elliptical prism. |
| A3 | flat | Stadium prism: straight sides, rounded fore and aft caps. |
| A4 | rocker | Lateral cylindrical rocker. The validated Phase 1 rocker. |
| A5 | rocker | Ellipsoidal rocker; curved fore-aft as well as laterally. |
| B0 | flat | D-base: rounded nose, flat transom. |
| B2 | flat | Forward teardrop: broad front, narrow tail. |
| B3 | flat | Rear teardrop — B2's exact fore-aft reflection, as a mirror control. |
| B4 | flat | B0 offset fore or aft under the upper body by `x_base`. |
| B5 | rocker | Lateral rocker whose fore-aft profile curves up asymmetrically. |
| B6 | flat | D-base whose top face is cut at `theta_base`, leaning the upper body. |

### The shared parameter schema

Every family is described against the same eleven normalized parameters:
`W_base/H`, `L_base/H`, `H_base/H`, `R_lat/H`, `R_fore/H`, `r_edge/H`, front/back
asymmetry `f_fb`, left/right asymmetry `f_lr`, base x-offset `x_base/H`,
intrinsic base lean `theta_base`, and base mass fraction. A single schema is
what makes families comparable at all: with bespoke knobs per shape, "the same
statue on a different base" would be undefined, and any geometry comparison
would be measuring the parameterisation as much as the physics.

Not every family reads every parameter — a rectangular prism has no lateral
curvature radius, and a cylinder's lateral radius is *defined* as `W_base/2`, so
offering a separate control for it would be a control that lies. Each family
therefore **declares** which parameters it reads. The UI greys out the rest with
the reason shown, and the diagnostics panel lists both sets by symbol. Nothing
is silently ignored.

Two invariants hold across every family and are asserted by test:

- **`W_base` is always the maximum lateral width and `L_base` always the total
  fore-aft length**, whatever the shape or the asymmetry. The asymmetry controls
  split an extent rather than adding to it: `f_fb` makes the forward half
  `(L/2)(1 + f)` and the rear `(L/2)(1 - f)`, and `f_lr` does the same
  laterally. They change shape, never size.
- **Out-of-range values in parameters a family does not read are ignored, not
  rejected.** Carrying one parameter set across families is the whole point of
  the schema; failing a family for a control it never touches would defeat it.

Where a family cannot honour all of `W`, `L`, `H_base` and a curvature radius
simultaneously, the conflict is resolved explicitly rather than by silently
losing one control. A5 is the clear case: for an ellipsoid `R_lat = b^2/c`, so
width, lateral curvature and height are not independent. A5 reads width and
`R_lat` and *derives* its height, and declares that it does not read `H_base/H`.

### Visual mesh versus collider approximation

A0 and A4 keep the exact analytic cuboid and cylinder they were validated with.
For those two the ideal shape **is** the primitive; tessellating it would be a
regression, not an approximation. They are also the controls: A4 is the only
smooth rocker, so if a result on a faceted rocker depends on facet count, A4 is
what exposes it.

The other ten are built as triangulated convex polytopes, and the display mesh
is generated from *the same triangles* the collider is. So the approximation is
singular and honest: a smooth ideal surface is represented by a polytope with a
stated facet count (32 segments per curved outline, 48 across a rocker arc, 13
stations along it), and nothing else differs between what is drawn and what is
simulated. Facet counts are fixed constants and deliberately **not** tied to the
`visualDetail` control — these triangles are the collider, and letting a display
setting change them would make the simulation depend on a cosmetic control.

Every footprint is built the same way: scatter points describing the intended
outline, then take their 2D convex hull. Convexity becomes a property of the
construction rather than of the author's care — which matters because the prism
triangulation fans from a single vertex and is only valid for convex outlines,
and Rapier would take the hull anyway, so a concave design point would produce a
collider that silently differed from the drawn mesh.

### Base mass, volume and centre of mass

Mass is still never assigned directly. Each collider gets a density derived from
its target sub-mass and the volume of the solid actually being simulated, and
Rapier derives the aggregate.

Two corrections were needed for the hull-backed families:

- **The base's centroid is no longer assumed to be at half its height.** That is
  exact for A0's prism and A4's lying cylinder and wrong for everything else — a
  half-ellipsoid's centroid sits at five-eighths of its height, and a
  wedge-topped base's sits off the centreline. Each family reports its own
  centroid, computed exactly from its polytope, so the analytic COM stays a real
  cross-check on Rapier's rather than a formula that happened to agree for two
  shapes.
- **Density is rescaled against the collider's own volume.** Rapier's hull
  builder can enclose slightly less than the polytope handed to it — measured at
  1.25% for A5, concentrated at its pointed fore-aft tips — which would leave the
  base a fraction of a percent light and shift the whole statue's COM. The
  diagnostics panel shows both volumes side by side so the deficit is visible
  rather than absorbed.

Measured across all twelve families at the baseline configuration: total mass
lands on 4000.00 kg exactly, and the independently-computed analytic COM agrees
with Rapier's to under a micron for every family except the two faceted rockers
(A5: 0.72 mm, B5: 0.02 mm, both the hull deficit above).

### Fore-aft mirror generation

B3 is not a second hand-written outline that resembles a mirrored B2 — it is
literally B2's polytope with x negated and its triangle winding reversed. A
mirror control is only worth running if the two shapes differ by *exactly* the
reflection and by nothing else, and the only way to be sure is to generate one
from the other. Measured: the two half-width profiles agree to 0.0 m across all
37 stations, and the base centroids are exactly ±0.126115 m.

`foreAftMirrorParams` returns the mirrored configuration, or **null** where no
exact mirror exists. The symmetric A-families are their own reflection; B2 and
B3 are each other's; B5 mirrors onto itself by negating `f_fb`, because its
fore-aft profile is built symmetrically from that one number. **B0, B4 and B6
have no exact mirror in this phase** — a D-shape's rounded nose and flat transom
are intrinsic to the outline, and negating the asymmetry merely makes the nose
shorter while leaving it at the front. Returning null rather than something
mirror-shaped is the point: a mirrored control that is not actually a mirror
would silently invalidate the trial it was run to validate. The diagnostics
panel flags those three families accordingly.

The lateral mirror is exact for every family, since every footprint is built
symmetric about y = 0 and then skewed by one signed number.

### The contact-patch defect, and the wedge decomposition

This is the substantive finding of Step 2, and it was not visible from the
geometry alone.

Rapier keeps **at most four solver contacts per collider pair**. For a convex
polyhedron resting face-down on the road, its contact-point selection could
collapse the patch: measured on the D-base, a 0.43 m wide contact patch shrank
to **39 mm** over three seconds, at which point the statue was balanced on a
stamp, injecting energy, and climbing 10–35 mm *with nothing pulling on it*.
Under a sub-threshold pull the same families wandered 17 mm backwards, then
30 mm forwards, and rose 12 mm — direction-reversing motion that is not physics.
A0 never showed any of it because box-versus-box has its own specialised,
robust contact path in Rapier, which is exactly why a whole phase of validation
on A0 could not have caught this.

Two fixes, both structural rather than tuned:

1. **No footprint may carry a degenerate edge.** Sampling an outline
   parametrically produces points that are mathematically distinct but
   numerically identical — an ellipse tip sampled at `t = pi/2` lands at
   `y = ±6e-17` rather than 0, giving two "vertices" a tenth of an attometre
   apart, and extruding that yields a face with no well-defined normal. Vertices
   closer than 1 nm are now collapsed. This alone reduced the D-base's drift
   sevenfold.
2. **Flat-bottomed bases are handed to the solver as a fan of wedge colliders**
   rather than as one solid, giving one contact manifold per wedge instead of
   one for the whole base, so the contact points stay spread around the real
   footprint. The union of the wedges is exactly the original solid: same
   outline, same volume, same mass, same centre of mass, all asserted by test.

The wedge count is a discretisation parameter and was chosen the way a timestep
is — by refining until the answer stops changing. D-base drift under a steady
sub-threshold pull held for five seconds, against a 0.5 mm rest tolerance:

| Wedges | 4 | 6 | 8 | 12 | 16 |
|---|---|---|---|---|---|
| Drift | 4.1 mm | 2.8 mm | 0.00 mm | 0.09 mm | 0.02 mm |

Eight is the first value in the converged region; twelve and sixteen confirm
nothing further is gained. The other flat families are already at rest by four;
the D-base needs more because its support region is fore-aft asymmetric, so its
contact constraints must spread further to hold the same pull.

**This is a contact-discretisation fix, not a physical one.** No damping was
added, no motion was clamped, and no geometry changed. The collider overlay
draws the wedges rather than the display solid, so what the overlay shows is
what the solver has.

The regression is written on the observable rather than on any internal detail:
*a statue standing on a level road with no forces applied must not move* —
under 1 mm of travel and under 1 mm/s after ten seconds, for every family.

### Step 2 limitations

- **B0, B4 and B6 have no exact fore-aft mirror control.** Any forward-advance
  result on those outlines cannot be mirror-tested in this phase; B2/B3 and B5
  can be, and are the families to run candidate trials on.
- **The faceted rockers roll on facets, not on a curve.** A5 and B5 step between
  48 facets per arc. A4 remains the exact analytic control for that.
- **A5's collider encloses 1.25% less than its design polytope**, concentrated
  at its pointed tips, where Rapier's hull builder merges near-coincident
  vertices. Mass is corrected to exact; the COM disagreement it leaves is
  0.72 mm and is displayed.
- **A3 degenerates to A2 when the base is wider than it is long.** Semicircular
  caps of radius `W/2` are themselves `W` long, so a stadium shorter than its
  width cannot exist; the caps flatten into semi-ellipses, which keeps both
  stated dimensions exact. At the default proportions the two families coincide
  and their volumes are identical.
- **B6's torso overlaps its own wedge base slightly toward the rear**, because
  the torso is mounted at the angled plane's centreline height rather than on
  its tallest corner. Mass is unaffected — each collider carries its own target
  mass — but the two solids are not disjoint.
- **No family has been run as a walking candidate.** Step 2 built and validated
  the geometry; whether any of it changes the response to the validated rope
  forces is Step 4's question, and nothing here has measured it.

---

## Steps 3–6 — not yet implemented

Nothing in the code implements these yet, and this document will not describe
them as though it does. When each lands, this file gains:

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
