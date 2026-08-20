# PHYSICS_MODEL — Walking Statues

This is a living document, updated as each phase in [PLAN.md](./PLAN.md)
lands. It exists so nobody has to read the source to find out what's real
physics, what's a documented stand-in, and what isn't modeled at all — the
project's explicit requirement is that none of that stays hidden.

**Current scope: Phase 1 (complete and validated), plus Phase 2 Step 1**
(procedural upper body and mass model). The remaining Phase 2 steps — the
extensible base-geometry factory, matched comparison, the geometry-only study
mode, and the P1/P3 pulling protocols — and Phases 3–5 add materially more
physics. This file is updated as each lands, not rewritten at the end.

## Directly simulated

- **Rigid-body dynamics.** One free 6-DOF rigid body, stepped by Rapier3D
  (WASM) at a fixed 1/240 s timestep via an accumulator loop, decoupled from
  render rate. Gravity, contact, friction, and applied rope forces are the
  only inputs to the solver — nothing writes a position or velocity
  directly except at (re)spawn.
- **Mass distribution, COM, and inertia.** Every collider (base, torso, head
  primitives) is assigned an explicit density computed from the
  `baseMassFraction` / `headMassFraction` parameters and that primitive's
  analytic volume, so the total mass, center of mass, and inertia tensor are
  never hand-specified — they fall out of the geometry and are read back
  from Rapier (`mass()`, `worldCom()`, `principalInertia()`) for the
  readouts.
- **Contact and friction.** Coulomb friction and restitution, one shared
  coefficient pair applied to every statue/road contact pair, resolved by
  Rapier's built-in contact solver.
- **Rope forces (explicit anchor geometry, "Version 2").** Each rope is
  defined by two points: an external puller anchor fixed in world space
  (where the haulers stand) and an attachment point fixed in the body,
  carried along as the statue rolls. The force direction is derived from that
  geometry every step as `d̂ = normalize(p_external − p_attachment)`, and the
  force `T·d̂` is applied *at the attachment* via `addForceAtPoint`, once per
  fixed step, with Rapier's force/torque latch reset first (see the finding
  below). The model is tension-only by construction — the force always points
  from the statue toward the haulers, so there is no way to express a rope
  that pushes. All twelve coordinates are user-editable, and the rendered
  rope, the force arrow, the diagnostics, and the solver all consume the same
  solution.
- **Static equilibrium.** A load below both the sliding and tipping
  thresholds produces no motion, to quantified tolerances (§ "Static
  thresholds" below). This is a property of the contact solver, not of
  damping: it holds with linear and angular damping set to zero.
- **Twelve base geometry families** (Phase 2 Step 2), described against one
  shared normalized parameter schema: symmetric A0-A5 and fore-aft asymmetric
  B0/B2/B3/B4/B5/B6. A0 and A4 keep the exact analytic cuboid and cylinder they
  were validated with; the other ten are triangulated convex polytopes whose
  display mesh is generated from the *same* triangles as the collider. Each
  family declares which shared parameters it reads, and each states its own
  collider approximation.
- **Mass distribution as a first-class parameter set** (Phase 2 Step 1). Torso
  taper and intrinsic forward lean move real material, so they change the
  collider cross-section, the COM and the inertia tensor. Lean rotates the
  *upper body only*, pivoting at the top of the base, so ground contact geometry
  is unaffected — it is a modelling parameter and is reported separately from
  dynamic pitch everywhere. Mass, COM and inertia remain derived from
  per-collider density and are cross-checked against an independent analytic
  calculation across taper, lean, both base families and skewed mass fractions.

## Documented approximations

- **Simplified upper-body collision.** The statue is *drawn* as a procedural
  Moai — tapered torso, arm relief, blocky head with brow, nose and ears — but
  it is *collided* as two primitives: one cuboid at the torso's mean
  cross-section, and one sphere of radius `H_head/2` for the head. The torso
  cuboid is exact at zero taper and an approximation of a frustum otherwise (a
  real frustum's centroid sits below its mid-height; the box's does not). The
  head sphere is conservative for contact, since the head does not normally
  touch anything, but it contributes a sphere's inertia rather than a box's.
  The collider overlay draws these three primitives colour-coded, and each
  states its own approximation in the diagnostics, so the gap between what is
  drawn and what is simulated is always visible rather than implied.
- **Full-cylinder A4 rocker.** A4 is a complete 360° cylinder rather than a
  partial rocking-chair arc, so nothing in the base geometry itself imposes
  a hard roll limit (see the finding below).
- **Faceted curved bases.** The ten polytope-backed families approximate their
  smooth ideal surface with a stated facet count — 32 segments per curved plan
  outline, 48 across a rocker arc, 13 stations along it. A5 and B5 therefore roll
  on facets rather than on a curve; A4 is retained as the exact analytic control
  for exactly that reason. These counts are fixed constants and are deliberately
  *not* tied to the visual-detail control, because the triangles are the collider.
- **Rapier's convex-hull builder merges near-coplanar vertices**, so the solid it
  constructs can enclose slightly less than the polytope handed to it — measured
  at 1.25% for A5, concentrated at its pointed fore-aft tips. Density is rescaled
  against the collider's own volume so mass lands exactly on target, and both
  volumes are shown side by side in the diagnostics rather than the deficit being
  absorbed.
- **Flat-bottomed bases are collided as eight wedges, not one solid.** This is a
  contact-discretisation fix, not a shape change: their union is exactly the
  original solid, with the same outline, volume, mass and COM, all asserted by
  test. See the finding below.
- **Euler-angle roll/pitch/yaw.** Extracted from the orientation quaternion
  via an 'XYZ' Three.js Euler decomposition. This degenerates near gimbal
  lock and roll/pitch stop being cleanly independent at large combined
  tilt — acceptable because the (currently crude, 60°) fallen-state
  threshold is crossed well before that regime.
- **Game-engine contact solving.** Rapier's semi-implicit Euler integration
  plus iterative velocity-level contact/friction constraints is standard
  real-time rigid-body practice, not a substitute for a validated
  multibody-dynamics tool. The project's planned dt-vs-dt/2 convergence
  check (Phase 4) and eventual MuJoCo-WASM cross-check exist to quantify
  how much this matters here.
- **One shared friction/restitution pair** for every contact in the scene,
  rather than per-material-pair values.

- **Mirror symmetry is ~1%, not exact.** Rapier's contact-constraint
  iteration order is fixed in world space and is not itself symmetric under
  `y → −y`, so a left pull and its exact mirror-image right pull do not
  produce bit-identical trajectories. Measured on the default statue at 1.4×
  the tipping threshold, the relative mirror error *shrinks* from 2.6% at
  0.25 s to 0.6% at 2.5 s — the signature of a small fixed bias rather than
  divergence. Rope forces and torques, read straight off the pose rather than
  integrated through the solver, mirror an order of magnitude more tightly
  (3e-5 rising to 1e-3 as the statue rolls past 20°). The regression test
  asserts a deliberately generous 5% bound and documents the measurement.

- **Explicit COM override** (Phase 2 Step 1). Optionally discards the derived
  mass properties and forces the COM to explicit offsets, for sweeps where COM
  is the independent variable. Collider shapes are untouched so contact is
  unchanged, but the inertia tensor is carried over from the derived body rather
  than recomputed — an overridden statue is therefore an **abstract probe, not a
  self-consistent rigid body**, and is labelled as one in the UI. Results from it
  explore a parameter axis; they do not simulate a buildable statue.

## Not modeled yet

- Rope compliance or slack. A rope's *geometry* is now explicit (external
  anchor + body attachment, with the direction derived from it), but a held
  rope is still an ideal constant-tension force rather than a spring-damper
  element, and a rope that would have gone limp because the statue moved
  toward the haulers keeps pulling. Slack handling arrives with the P3
  protocol in Phase 2.
- Any pulling protocol beyond direct manual hold (P0–P5 are Phase 2).
- Concave or rough road, road slope.
- Work/energy accounting, contact-force event logging, slip ratio, lateral
  drift, cost-of-transport, or any of the documented failure-state
  criteria beyond a placeholder 60° "fallen" angle check.
- Base families B1 and C0–C5. The fore-aft asymmetric families that directed
  walking would actually require now exist (Phase 2 Step 2), but **none has been
  run as a walking candidate** — building the geometry is not measuring it, and
  no result obtained so far has done so.
- Everything under Calibration mode and batch sweeps.

## Static thresholds, and what the benchmarks actually check

For a flat-bottomed base under one rope, two independent static failures
compete. Sliding when the horizontal pull beats friction:

$$F_{slide} = \mu_s M g$$

and tipping about the downwind edge of the footprint when the pull's moment
beats the weight's restoring moment, with base half-width $b$ and attachment
height $z_a$:

$$F_{tip} = \frac{M g\,b}{z_a}$$

Below $\min(F_{slide}, F_{tip})$ the statue must not move. Which of the two
governs decides the *character* of the failure, and that is the knob that
matters for this project: raise $\mu$ and tipping governs, so the statue
rocks; lower $\mu$ and sliding governs, so it slides flat and cannot be
rocked at all.

Measured on the default statue ($M = 4000$ kg, $b = 0.560$ m,
$z_a = 2.450$ m, $\mu = 0.65$): $F_{slide} = 25\,506$ N,
$F_{tip} = 8\,969$ N, so tipping governs.

| μ | governing | F_slide | F_tip | observed onset | mode |
|---|---|---|---|---|---|
| 0.12 | SLIDING | 4 709 N | 8 969 N | 4 709 N (100%) | SLIDING |
| 0.65 | TIPPING | 25 506 N | 8 969 N | 8 969 N (100%) | ROCKING |
| 1.20 | TIPPING | 47 088 N | 8 969 N | 8 969 N (100%) | ROCKING |

Onset agrees with the analytic prediction to within one 5% ramp step in all
three regimes, and the sliding/rocking character flips in the correct
direction with friction. At 50% of the governing threshold, held 5 s, the
statue holds to 4.0e-5 m and 1.2e-3° — 12× and 44× inside the required
tolerances.

**Both formulas assume a purely horizontal pull**, which is why the
benchmarks arrange the rope that way. Once a rope pulls partly downward it
presses the statue into the road, raising both thresholds. The diagnostics
panel therefore reports the reference values *and* geometry-aware values for
the actual configured rope direction, side by side, rather than quoting one
and hoping the difference is negligible.

$F_{tip}$ requires a finite $b$. A rocker base has line contact, so $b = 0$:
no static tipping threshold and no tipping angle exist, and the benchmark
reports "not applicable" rather than inventing a number.

## A genuine finding from Phase 1: Rapier's applied forces are a persistent latch

`addForce`, `addForceAtPoint` and `addTorque` do not set a load for one step.
They **add into a latch on the rigid body that `world.step()` never clears** —
only `resetForces` / `resetTorques` clear it. Applying a rope force once per
fixed step without resetting therefore delivers `n × F` on step `n`, and the
latched load persists indefinitely after release.

This was a live defect through Phase 1 and is worth recording because it is
silent and mimics a contact bug. Measured: a nominal 3000 N pull (33% of this
statue's tipping threshold — a force that must hold static) reached ~3.6 MN
over a 5 s hold, about 92× the statue's weight, and moved it 1.4 km. After
release it kept accelerating while the UI honestly reported 0 N, because the
readout reflected the *requested* force. Symptomatically it looked like
"a below-threshold force still rotates the statue", which points at friction
or contact — neither of which was at fault.

Both resets are required. Rapier documents `resetForces` as clearing "the
user forces (but not torques)", and `addForceAtPoint` decomposes into a force
at the COM plus a torque, so resetting only forces silences the runaway
translation and leaves the spin — measured at 31× the intended angular
velocity. That is why the defect presented as *rotation* first.

The fix is `resetForces(true)` + `resetTorques(true)` at the top of every
fixed step, in `control/ropeForces.ts`. It is not damping, not a velocity
clamp, and not a position lock: with the reset in place the statue holds
static equilibrium at 95% of its tipping threshold **with damping set to
zero**. Full audit, including everything that was ruled out, in
[PHASE1_FORCE_CONTACT_AUDIT.md](./PHASE1_FORCE_CONTACT_AUDIT.md).

## Matched comparison: what is normalized, and what that costs

Phase 2 Step 3 added a controlled comparison mode. Two points belong in the
physics record rather than only in the guide:

- **Internal ballast is a mass, not a shape.** It is applied through Rapier's
  *additional* mass properties, which are summed with the collider-derived ones.
  No collider is added, moved, resized or re-densified, so a ballasted statue's
  contact behaviour is provably identical to the same statue without it. The
  ballast carries no rotational inertia of its own — it is a point mass, so its
  entire contribution to the inertia tensor is the parallel-axis term of its
  offset. Giving it a fabricated spread would silently change the rocking
  dynamics a comparison is trying to hold fixed.
- **Some quantities genuinely cannot be matched.** A cylindrical rocker is as
  tall as it is wide; a fore-aft rocker's height is its lateral radius plus its
  fore-aft rise. Locking base height alongside width over-constrains both, and
  the app reports the scenario invalid with the reachable range rather than
  approximating. Matching mass, COM *and* principal inertia across unlike shapes
  requires an internal mass distribution no real arrangement of the statue's
  material would produce, and is labelled an abstract probe when used.

See MATCHED_COMPARISON_GUIDE.md.

## A genuine finding from Phase 2: a flat hull can collapse its own contact patch

Rapier keeps at most **four solver contacts per collider pair**. For a convex
polyhedron resting face-down on the road, its contact-point selection is not
guaranteed to keep those four spread across the face. Measured on the D-base:
the contact patch started at 0.43 m wide and shrank to **39 mm** over three
seconds, at which point the statue was balancing on a stamp — and it then began
*injecting* energy, climbing 10–35 mm with no rope attached and no forcing at
all. Under a steady sub-threshold pull the same families wandered 17 mm
backwards, then 30 mm forwards, and rose 12 mm: direction-reversing motion that
is not physics.

Two details make this worth recording rather than just fixing:

- **A0 never showed it.** Box-versus-box has its own specialised, robust contact
  path in Rapier. A full phase of validation against A0 could not have caught
  this, which is a concrete argument for re-validating contact whenever the
  collision *representation* changes, not only when the physics does.
- **B2 and B3 — exact geometric mirrors — behaved 30× differently.** That
  asymmetry was the tell that the cause was numerical rather than physical, since
  a fore-aft reflection cannot affect a purely lateral pull.

The fix is structural, not tuned: sub-nanometre degenerate footprint edges are
collapsed, and flat-bottomed bases are handed to the solver as eight wedge
colliders whose union is exactly the original solid. No damping was added, no
motion clamped, no geometry changed. The wedge count came from a convergence
study, not from tuning until it passed: against a 0.5 mm rest tolerance, D-base
drift measured 4.1 mm at four wedges, 2.8 mm at six, 0.00 mm at eight, 0.09 mm at
twelve and 0.02 mm at sixteen — so eight is the first value in the converged
region.

The regression guarding it is written on the observable — *a statue standing on
a level road with nothing pulling it must not move* — rather than on any internal
detail of the decomposition, and it runs for every family at both three and ten
seconds.

## A genuine finding from Phase 1: A4 is passively unstable at realistic scale

Working out the rolling-without-slipping potential energy for a cylindrical
rocker of radius $R$ with the system COM offset $a = z_{COM} - R$ above the
cylinder's own center gives $U(\theta) = Mg(R + a\cos\theta)$, stable at
$\theta = 0$ only if $a < 0$ — the COM must sit *below* the rocker's center,
exactly the classic weeble-toy condition. For a statue-scale body, the COM
sits at roughly half the total height, and keeping the rocker radius above
that would mean a rocker wider than the statue is tall. So A4 is passively
unstable by construction at any realistic proportion, not because of a
tuning mistake: released from upright it stays put (an exact equilibrium,
verified — 5 s idle with zero drift), but once perturbed — including by the
user's own rope pull — gravity accelerates the roll rather than restoring
it, and the statue rolls away down the road rather than settling into a
rock. This is why the default preset uses **A0**, not A4, and it is also a
real, load-bearing point about the underlying hypothesis: a free-rolling
cylindrical base cannot be walked by letting it rock on its own between
pulls. It requires continuous, alternating rope tension acting as an active
control loop — the human handlers are load-bearing, not optional, for this
base family. See the Theory section (§5) in the app itself for the full
derivation and the live diagram.

## What should be measured experimentally (not yet a real workflow)

Calibration mode (Phase 5) will need, at minimum: total mass, COM location,
static and kinetic friction coefficients, and rope-force time series from
an actual or scale-model pull. None of this is wired up yet; today's
"friction coefficient" and "restitution" sliders are illustrative defaults,
not measurements.

## What Phase 1 does and does not claim about forward walking

**Phase 1 validates contact, static equilibrium, sliding, and lateral
rocking. It makes no claim of directed forward walking, and should not be
read as one.**

A symmetric base on a symmetric flat road is not expected to produce reliable
forward motion, and measurement bears that out: driven at 1.4× the tipping
threshold, the default A0 statue advances **0.15 mm along x while moving
0.63 m along y**. The forward displacement is effectively zero even though
the default rope geometry has a substantial forward direction component
(`d̂ₓ ≈ 0.48`). Friction pins the contact patch fore-aft while the statue
rotates about a lateral edge; there is nothing in a fore-aft symmetric
geometry to convert that rocking into a preferred direction.

That is the correct and expected result at this stage, not a shortfall. It
also means the honest reading of a Phase 1 run is "this rocks, and rocking
alone does not walk it".

Directed walking, when it is attempted, must emerge from:

- **fore-aft asymmetric base geometry** (the B-family D-bases and forward
  teardrops — B0, B2, B6);
- **COM and intrinsic-lean asymmetry**, separate from dynamic pitch;
- **realistic rope direction**, including the forward component that already
  exists in the model;
- **asymmetric contact transfer** — the heel/toe pivot migrating as the
  statue rolls from one edge to another.

It must never come from manually imposed translation, a scripted
displacement, or a forward velocity written directly onto the body. If a
future phase reports forward progress, the first question to ask of it is
which of the four mechanisms above produced it.

## Qualitative vs. calibration-dependent results

Everything the app currently shows is **qualitative**: it demonstrates that
rocking, sliding, and toppling are all reachable outcomes of the same rigid
body model depending on parameters, and that the two Phase 1 base families
have genuinely different stability physics (a fixed critical tipping angle
for A0 vs. a rolling-contact condition for A4). None of the numbers — step
length, force thresholds, or angles — should be read as a claim about a
specific real statue or a specific historical technique.
