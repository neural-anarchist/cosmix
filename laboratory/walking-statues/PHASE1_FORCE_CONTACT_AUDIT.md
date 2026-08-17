# PHASE1_FORCE_CONTACT_AUDIT — force application and static contact

Audit of the Phase 1 force/contact implementation, written **before** any
corrective change, in response to two reported defects:

- **D1** — a lateral pull below both the static-sliding and static-tipping
  thresholds still rotates and translates the statue if held for several
  seconds.
- **D2** — the rope model pulls purely left/right in world space and does
  not represent a plausible walking-statue pulling setup.

Both are confirmed real. **D1 has a single root cause, and it is not a
contact-model problem at all — it is a force-lifetime problem.** The
contact model turns out to be correct and, once the force bug is fixed,
holds static equilibrium to well inside the required tolerances with
damping set to zero.

Every number below was measured, not derived by inspection. The probe
scripts that produced them are described at the end, in
[§8](#how-these-numbers-were-obtained).

---

## 1. Road collider

Built in `src/road/flatRoad.ts`.

| Property | Value |
|---|---|
| Body type | `RigidBodyDesc.fixed()`, translation `(0, 0, −0.2)` |
| Collider geometry | `ColliderDesc.cuboid(lengthM/2, widthM/2, 0.2)` — a 0.4 m thick slab, **not** a half-space/plane |
| Top surface | `z = 0` exactly (`−0.2 + 0.2`) |
| Friction | `params.frictionCoefficient`, default **0.65** |
| Restitution | `params.restitution`, default **0.05** |
| Collision groups | **never set** → Rapier default (membership `0xffff`, filter `0xffff`): collides with everything |
| Solver groups | never set → default |
| Contact settings | never set: no `setContactForceEventThreshold`, no `setActiveEvents`, no custom combine rule, not a sensor |
| Friction combine rule | never set → Rapier default (`Average`) |

**Finding 1.1 — no defect.** The slab is a solid cuboid with its top face
at exactly `z = 0`, and the statue's body origin is also at `z = 0` with
its base bottom at local `z = 0`. The two surfaces are therefore
coincident at spawn, not interpenetrating and not separated. Rapier's
default `normalizedPredictionDistance` is 0.02 m, comfortably enough to
generate contacts from a coincident start.

**Finding 1.2 — no defect, but undocumented.** Because both the road and
every statue collider are assigned the *same* coefficient and the combine
rule is `Average`, the effective contact friction equals the slider value
exactly. This is the intended behaviour but it is an accident of both
sides being set identically — the audit found no place where the combine
rule is stated. Worth documenting rather than changing.

---

## 2. Statue colliders

Built in `src/statue/factory.ts` (torso, head) and
`src/statue/bases/a0-flatRect.ts` / `a4-lateralRocker.ts` (base). All three
are attached to **one** dynamic `RigidBody` — a compound body, one body, no
joints.

Body: `RigidBodyDesc.dynamic()`, translation `(0, 0, 0)`, linear damping
**0.05**, angular damping **0.15**. No `setCcdEnabled`, no dominance
group, no `lockRotations`/`lockTranslations`, no `setSoftCcdPrediction`.

For the default parameter set (`H = 3.5 m`, `M = 4000 kg`, A0 base):

| Collider | Shape | Local translation | Local rotation | Volume | Target mass | Density set | Friction | Restitution | Groups |
|---|---|---|---|---|---|---|---|---|---|
| A0 base | `cuboid(0.385, 0.560, 0.280)` | `(0, 0, 0.280)` | identity | 0.4829 m³ | 1400 kg (0.35 M) | 2899.2 | 0.65 | 0.05 | default |
| Torso | `cuboid(0.280, 0.385, 1.260)` | `(0, 0, 1.820)` | identity | 1.0865 m³ | 1600 kg | 1472.5 | 0.65 | 0.05 | default |
| Head | `ball(0.210)` | `(0, 0, 3.290)` | identity | 0.03879 m³ | 1000 kg (0.25 M) | 25781.6 | 0.65 | 0.05 | default |

(The A4 base is a `cylinder(halfLengthX, radius)` at `(0, 0, radius)` with
a quaternion rotating its axis from `+y` to `+x`; same friction /
restitution / density treatment.)

Note the deliberate axis convention in the cuboid half-extents: the first
argument is the **x/forward** half-extent and the second is the
**y/lateral** half-extent, so `cuboid(depth/2, width/2, height/2)`. This
is consistent between base, torso and the display meshes.

**Verified against Rapier's own aggregate:** reported `mass()` = **4000.0
kg** (exactly the target), `worldCom().z` = **1.6485 m**. Masses are
derived from per-primitive density as intended, not hand-specified.

**Finding 2.1 — no defect.** Friction and restitution are set on *every*
statue collider, base included (`factory.ts` maps `setFriction`/
`setRestitution` over `base.colliderDescs` before creating them). No
collider is left at Rapier's default friction. Nothing is zero.

**Finding 2.2 — no defect.** Collision groups are default everywhere, so
statue↔road contact is enabled. No filtering is suppressing contact.

**Finding 2.3 — contact is genuine full-face, not edge/point.** Measured
after a 1 s settle: **1 contact pair, 4 contact points**, manifold normal
exactly `(0, 0, 1)`, resting penetration **−9.16 × 10⁻⁵ m** (0.09 mm, well
inside Rapier's 0.005 m normalized allowed linear error), residual
`linvel.z` = **0.000 m/s**. The body is not airborne, not tilted, not
resting on an edge, and has no residual velocity after reset.

---

## 3. Manual rope force generation

`src/control/ropeForces.ts`, called from `SimulationEngine.stepPhysics()`.

Per held side:

| Step | Value (left rope, defaults) |
|---|---|
| Local attachment | `leftAnchorLocal = (0, +0.560, 2.450)` — from `torsoWidth/2 + 0.05·H` and `torsoBottomZ + 0.75·torsoHeight` |
| World attachment | `q ⊗ local + t`; at rest = `(0, +0.560, 2.450)` |
| World force vector | **hardcoded** `(0, +F, 0)` for left, `(0, −F, 0)` for right |
| API used | `rigidBody.addForceAtPoint(F_world, p_world, true)` — force, **not** impulse |
| Call site | `stepPhysics()`, i.e. **once per fixed 1/240 s step**, not once per render frame |
| Cleared after release? | **NO — never cleared at all** |

**Finding 3.1 — THE ROOT CAUSE (D1).**
`addForceAtPoint` does not set a force for one step. It **adds into a
persistent force/torque latch on the rigid body that `world.step()` never
clears.** Rapier only clears it when `resetForces()` / `resetTorques()`
are called explicitly. Nothing in this codebase ever calls either.

Consequence: holding a button for `n` steps applies an effective force of
**n × F_slider**, growing linearly with hold time at 240 steps per second.

Measured on a unit-mass body, 1 N nominal, 1 s hold (240 steps), gravity
off:

| | vₓ after 1 s |
|---|---|
| Observed | **120.500 m/s** |
| Predicted if force were one-shot per step | 1.000 m/s |
| Predicted if force accumulates (`Σ k·F·dt`, k = 1..240) | **120.500 m/s** |

Exact agreement with the accumulation model — a **120.5×** overshoot after
only one second. The overshoot factor is `(n+1)/2`, so it grows without
bound: 600× at 5 s.

At statue scale this is decisive. Nominal 3000 N (33 % of the tipping
threshold, i.e. a force that *must* hold static), held 5 s:

| | Δy | Δroll | speed | angular speed |
|---|---|---|---|---|
| **Current code** | **1 429 292 mm** (1.43 km) | **85.9°** | 399 917 mm/s | 3830 °/s |
| Reset each step | 0.039 mm | 0.0008° | 0.013 mm/s | 0.0004 °/s |
| Required tolerance | < 0.5 mm | < 0.05° | < 1 mm/s | < 0.1 °/s |

The reported "below-threshold rotation" is therefore not marginal
threshold behaviour, not solver drift, and not a friction problem: the
simulation is being asked to resist a force that reaches **3.6 MN** —
about 92× the statue's own weight — by the end of a 5 s hold.

**Finding 3.2 — second, independent symptom of the same root cause: the
force is never released.** Because nothing resets the latch, releasing the
button leaves the entire accumulated force applied forever. Measured (unit
body, hold 0.5 s then "release" and coast 1 s):

- vₓ at release: 30.25 m/s
- vₓ after 1 s of *no input at all*: **150.25 m/s** — still accelerating.

Meanwhile the UI honestly reports `0 N`, because `lastAppliedLeftN` is set
from the *requested* force. So after any pull, the statue keeps
accelerating under an invisible force the readout says is not there. This
fully explains "held for several seconds can eventually rotate the
statue".

**Finding 3.3 — `resetForces()` alone is not sufficient.** Rapier's own
docs: `resetForces` resets "the user forces (but not torques)".
`addForceAtPoint` decomposes into a force at the COM **plus** a torque, so
the torque half needs `resetTorques()` as well. Measured (1 N at
`(0,0,1)` on a unit cube, intended `|ω|` = 6.000 rad/s after 1 s):

| Reset strategy | \|v\| | \|ω\| |
|---|---|---|
| `resetForces()` only | 1.000 m/s ✓ | **188.496 rad/s** ✗ (31× too high) |
| `resetForces()` + `resetTorques()` | 1.000 m/s ✓ | **6.000 rad/s** ✓ |

This is the specific trap that makes D1 present as *rotation* first: a
partial fix would silence the translation and leave the spin.

**Finding 3.4 — not a defect, and worth stating because it was
suspected.** The force is *not* applied from a render-frame path, and is
*not* framerate-dependent. `applyManualRopeForces` is called only from
`stepPhysics()`, exactly once per fixed step. The magnitude is also not
mis-normalized — `F_slider` is passed through unscaled. The existing code
comment claiming the model is "independent of display framerate" is
literally true and completely beside the point: the bug is that it
accumulates at all.

---

## 4. Torque generation

**Finding 4.1 — the application point is correct.** Force is applied at
the world-space rope anchor via `addForceAtPoint`, not at the COM. The
anchor is transformed body-local → world each step
(`local.applyQuaternion(q).add(origin)`), so it tracks the statue as it
rolls. This part of the model is right and should be preserved.

Intended torque about the COM for the default left pull at 3000 N:

```
r = p_anchor − r_COM = (0, 0.560, 2.450) − (0, 0, 1.6485)
                     = (0, 0.560, 0.8015)  m
F = (0, 3000, 0)  N

tau = r × F = (0.560·0 − 0.8015·3000,  0.8015·0 − 0·0,  0·3000 − 0.560·0)
            = (−2404.5, 0, 0)  N·m
```

A pure roll torque about `x` of magnitude **2404.5 N·m**, sign negative
(rolling the statue toward −y as the +y-side rope pulls its top). Direction
and axis are both physically correct.

What is wrong is only the magnitude actually delivered: the latch means
step `k` of a hold delivers `k × (−2404.5) N·m`, not `−2404.5 N·m`. There
is **no diagnostic anywhere in the app that logs applied torque**, which
is why an 8-order-of-magnitude force error was invisible for a whole
phase. Adding that readout is part of the fix, not a nicety.

---

## 5. Damping, timestep and solver settings

| Setting | Value | Where |
|---|---|---|
| Fixed timestep | 1/240 s (0.0041667) | `core/constants.ts` |
| Gravity | `(0, 0, −9.81)` | `SimulationEngine.init()` |
| Linear damping | **0.05** | `defaults.ts` → `RigidBodyDesc.setLinearDamping` |
| Angular damping | **0.15** | `defaults.ts` → `RigidBodyDesc.setAngularDamping` |
| `numSolverIterations` | 4 (Rapier default — never set) | — |
| `numInternalPgsIterations` | 1 (default) | — |
| `normalizedAllowedLinearError` | 0.005 (default) | — |
| `normalizedPredictionDistance` | 0.02 (default) | — |
| `maxCcdSubsteps` | 1 (default) | — |
| Max steps per frame | 8, surplus time discarded | `core/constants.ts` |

**Finding 5.1 — damping is not masking or causing anything, proven.** The
static-hold result is *identical* to 4 significant figures with damping
set to zero:

| 50 % of threshold, 5 s | Δy | Δroll |
|---|---|---|
| linDamp 0.05, angDamp 0.15 | 0.028 mm | 0.0012° |
| linDamp **0**, angDamp **0** | 0.028 mm | 0.0012° |

So the correct static equilibrium after the fix is produced by the contact
solver, not by damping — which is exactly the property the fix is required
to demonstrate. The existing damping values are small enough to be
irrelevant here and are *not* being used as a substitute for correct
contact.

**Finding 5.2 — no defect found in solver settings.** Default iteration
counts hold the resting statue to 0.09 mm penetration with zero residual
velocity, and reproduce the analytic tipping threshold to within one 5 %
ramp bucket (§6). No evidence that iteration count or timestep causes
contact drift at this scale.

---

## 6. Threshold agreement after the fix

Default statue, measured from Rapier: `M` = 4000.0 kg, `b` = 0.5600 m,
`z_anchor` = 2.4500 m, `μ` = 0.65, COM height 1.6485 m.

```
F_slide = mu·M·g          = 0.65 · 4000 · 9.81   = 25 506 N
F_tip   = M·g·b/z_anchor  = 39 240 · 0.56 / 2.45 =  8 969 N
min(F_slide, F_tip) = 8 969 N   -> governed by TIPPING
```

Force ramp with the reset-each-step fix, 3 s per point:

| % of threshold | Force | Δy | Δroll | verdict |
|---|---|---|---|---|
| 25 % | 2242 N | 0.03 mm | −0.001° | held |
| 50 % | 4485 N | 0.02 mm | −0.001° | held |
| 70 % | 6278 N | 0.02 mm | −0.002° | held |
| 80 % | 7175 N | 0.02 mm | −0.002° | held |
| 90 % | 8072 N | 0.03 mm | −0.002° | held |
| 95 % | 8521 N | 0.04 mm | −0.002° | held |
| **100 %** | **8969 N** | 3.33 mm | −0.115° | **onset** |
| 105 % | 9418 N | 2445 mm | −100.2° | ROCKING |
| 125 % | 11 211 N | 4029 mm | −155.4° | ROCKING |

Observed onset falls in the 95–100 % bucket against an analytically
predicted 100 %. The contact model reproduces the static tipping threshold
correctly once the force is applied correctly.

---

## 7. Rope geometry (D2)

`ropeForces.ts` (physics) and `SimulationEngine.updateSingleRopeVisual()`
(display).

**Finding 7.1 — force direction is hardcoded, not geometric.** The physics
force is literally `{x: 0, y: ±F, z: 0}`. There is no external anchor
point in the physics model at all, so no rope direction can be derived. A
rope that is only ever `±y` can never contribute a forward component,
which is why nothing in Phase 1 could ever have produced forward motion
even in principle.

**Finding 7.2 — the visual rope and the physics force are unrelated
constructs.** The visual invents a "ground anchor" per frame:

```js
scratchGroundAnchor.set(anchorWorld.x, sign * (halfRoadWidth - 0.4), 0.4);
```

- Its `x` is copied from the statue's own anchor → the drawn rope has
  **zero forward offset**; it is exactly perpendicular to the road.
- It has a `z` component (2.45 m down to 0.4 m), so the drawn **rope line
  is not parallel to the drawn force arrow**, which is set to exactly
  `(0, ±1, 0)`.
- It is derived from `roadParams.widthM`, so dragging the road-width
  slider silently moves the puller.
- It exists only in the render path. The physics never sees it.

So the picture shows a rope at one angle while the solver uses another,
and neither corresponds to a plausible haul geometry. This is a modelling
defect, as reported — not merely a cosmetic one, because the visual is the
only thing a user can check the force direction against.

**Finding 7.3 — the anchor height is right and should be kept.** At 2.45 m
on a 3.5 m statue, `z_anchor` is well above the COM (1.65 m), giving a
genuine tipping moment arm. `F_tip < F_slide` at default friction, so the
default configuration is already in the rocking-dominated regime the
project wants to study.

---

## 8. Conclusions

**D1 root cause — single, confirmed, non-obvious:** Rapier's
`addForce*` family writes into a persistent force/torque latch that
survives `world.step()`. The engine adds to that latch once per fixed step
and never resets it, so a held rope force grows linearly with hold time
(`n × F`, reaching 92× the statue's weight over a 5 s hold) and then
persists indefinitely after release while the UI reports 0 N. Rotation
appears first and most strongly because the latched *torque* needs its own
`resetTorques()` and is the larger error in relative terms.

**The contact model itself required no change.** Friction is correctly set
on every collider, contact is persistent 4-point full-face with a vertical
normal, resting penetration is 0.09 mm, residual velocity is zero, and with
the force bug fixed the body holds static to 0.04 mm / 0.002° at 95 % of
the tipping threshold **with damping set to zero**, then breaks away within
one 5 % bucket of the analytic prediction.

**D2 root cause:** no external anchor exists in the model; force direction
is a hardcoded world-space `±y` constant, and the rope drawn on screen is a
separate per-frame fabrication that agrees with neither the force
direction nor any fixed puller position.

### What gets changed

1. `resetForces(true)` **and** `resetTorques(true)` at the top of every
   fixed step, before the step's forces are applied. Not damping, not a
   position lock, not a velocity clamp.
2. Replace the hardcoded `±y` force with an explicit rope model:
   configurable external puller anchor + statue-local attachment,
   `d̂ = normalize(p_external − p_attachment)`, tension-only `F = T·d̂`,
   applied at `p_attachment`. One geometry, shared by physics and display.
3. Add the diagnostics that would have caught this in the first place:
   applied force components, applied torque about the COM, predicted
   `F_slide`/`F_tip`, contact count, regime classification.
4. Regression tests locking in the static-equilibrium benchmark and
   mirror symmetry, so the latch bug cannot return silently.

### How these numbers were obtained

Four Node probes run against the project's own installed
`@dimforge/rapier3d-compat`, outside the app so the engine's own code
paths could not influence the result:

- `force-semantics.mjs` — discriminates one-shot vs accumulating force
  lifetime; measures post-release persistence.
- `torque-reset.mjs` — shows `resetForces()` alone leaves torque latched.
- `statue-scale.mjs` — rebuilds the default statue exactly as
  `factory.ts` does; current-vs-fixed 5 s runs, zero-damping control,
  force ramp.
- `contacts.mjs` — contact pair/point count, manifold normal, resting
  penetration.

These are throwaway diagnostics, not part of the deliverable. The
permanent versions of the two most important checks become the automated
regression tests listed above.
