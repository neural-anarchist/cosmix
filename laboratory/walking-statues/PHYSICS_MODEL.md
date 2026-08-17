# PHYSICS_MODEL — Walking Statues

This is a living document, updated as each phase in [PLAN.md](./PLAN.md)
lands. It exists so nobody has to read the source to find out what's real
physics, what's a documented stand-in, and what isn't modeled at all — the
project's explicit requirement is that none of that stays hidden.

**Current scope: Phase 1 only.** Everything below describes the state after
Phase 1 (app shell, flat road, A0/A4 bases, manual rope forces). Phases 2–5
add materially more physics (compound multi-primitive colliders, more base
families, pulling protocols, energy/work accounting, concave and rough
roads) — this file gets a corresponding update in each of those phases, not
a rewrite at the end.

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
- **Two base geometry families**, A0 (flat rectangular prism) and A4
  (lateral cylindrical rocker), each with its own analytically-derived
  collider and matching visual mesh.

## Documented approximations

- **Simplified torso/head.** The display and collision geometry above the
  base is a plain box + sphere in Phase 1, not the tapered/lathe-generated
  Moai silhouette. This affects only appearance and coarse mass
  distribution, not the physics *architecture* — the Phase 2 statue factory
  swaps this out behind the same interface.
- **Full-cylinder A4 rocker.** A4 is a complete 360° cylinder rather than a
  partial rocking-chair arc, so nothing in the base geometry itself imposes
  a hard roll limit (see the finding below).
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
- Base families A5, B0, B1, B2, B3, B4, B5, B6, C0–C5.
- Everything under Calibration mode, batch sweeps, matched-comparison mode,
  and export.

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
