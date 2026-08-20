# MATCHED_COMPARISON_GUIDE — Walking Statues

Phase 2 Step 3 builds the infrastructure for a fair comparison between base
geometries. **It establishes fair comparison only. It does not test locomotion,
and nothing in it measures walking.**

---

## Why this exists at all

Twelve base families now exist, and the obvious next question — *does base
geometry alone change the response to the same rope forces?* — has an obvious
trap in it. Switch from A0 to B2 in raw geometry mode and you have changed the
shape, but you have also changed the base's volume from 0.483 m³ to 0.331 m³,
and with it the mass distribution, the centre of mass and the inertia tensor.
If the teardrop then behaves differently, nothing about that result isolates
the teardrop.

A candidate can look better for at least six reasons that have nothing to do
with the mechanism under test. It can be heavier, or lower-slung, or have a
wider footprint, or a larger base volume, or be given more rope tension, or be
run on a different road. Matched comparison exists to remove all six.

---

## The two modes

### Raw Geometry

Each family carries the mass, COM and inertia that its own shape and densities
imply. Nothing is normalized. This is the honest mode for inspecting a
physically-constructed candidate — it is what the statue would actually be if
you carved it — and it is the wrong mode for claiming one family is
mechanically superior.

The app says so, permanently, in a banner:
`RAW GEOMETRY — not a controlled performance comparison`.

### Matched Comparison

Chosen quantities are held equal across a family switch, so that shape is the
only thing that varies. The banner reads either
`MATCHED COMPARISON — all required locks satisfied` or
`MATCHED COMPARISON INVALID — one or more constraints cannot be met`, and a
table below it gives, for every quantity: the target, what was achieved, the
absolute and relative error, the status, and **the method used to get there**.

A comparison that cannot be inspected is not worth much, so nothing is
summarised away.

---

## What each preset locks

A preset says *what* is held equal. It never says *to what value* — the targets
are captured from a baseline family that you choose explicitly, so the reference
point is always a deliberate decision rather than a hidden default.

| Preset | Locks | Deliberately leaves free |
|---|---|---|
| **Raw Geometry** | nothing | everything |
| **Matched Envelope** | total height, max lateral width, fore-aft length, base height, road, rope anchors, rope attachments, max tension, solver | total mass, base mass, COM, inertia |
| **Matched Mass + COM** | total height, total mass, total COM, road, rope geometry, max tension, solver | width, length, base height, base volume, inertia |
| **Matched Mass + COM + Width** | the above plus max lateral width | length, base height, base volume, inertia |
| **Matched Volume + Width** | total height, base volume, max lateral width, road, rope geometry, max tension, solver | total mass, COM, fore-aft length, inertia |
| **Matched Moai Candidate Trial** | total height, total mass, total COM, max lateral width, fore-aft length, road, rope anchors, rope attachments, max tension, timestep/solver, initial pose | base height, base volume, inertia — all consequences of the shape being compared |

**Matched Moai Candidate Trial is the preset that later A0/B0/B2/B3/B5/B6
candidate comparisons should use.**

No preset enables every lock, because several combinations are mutually
incompatible. A rocker's base height is fixed by its own width and curvature, so
locking width and base height together over-constrains it; a preset that was
invalid for half the families by construction would be worse than useless.

---

## Two different kinds of normalization

### Geometric normalization — changing the shape's dimensions

Locks on height, width, length, base height and base volume are met by adjusting
the family's own normalized parameters, then rebuilding the geometry.

- Width and length are **exact assignments**: every family guarantees
  `widthY = (W_base/H) x H` and `lengthX = (L_base/H) x H`, an invariant asserted
  family-by-family in Step 2, so no solving is needed.
- Base height and base volume are met by a **numeric solve** against the
  family's own `dims()`. This is deliberately numeric rather than algebraic:
  twelve families derive volume and height from shape in twelve different ways,
  and hand-deriving an inverse for each would be twelve chances to be subtly
  wrong in a way that still produced plausible numbers.

Under scaling, the family's intended asymmetry is preserved (the asymmetry
parameters are untouched), `W_base` never stops meaning maximum lateral width,
`L_base` never stops meaning total fore-aft length, and the wedge decomposition
is re-run on the scaled solid so the collision pieces still tile it exactly with
no gaps or overlap. All of this is asserted by test.

### Mass and COM normalization — changing where the mass sits

Geometry is **never secretly distorted** to force mass or COM equality. The
hierarchy is:

1. Preserve the family's external dimensions and collision profile.
2. If total mass is locked, scale the component densities — the geometry keeps
   its shape and changes only how dense it is.
3. If total COM is locked, move it with an **explicitly labelled internal
   ballast mass**, and report where that mass went.
4. If the COM target would put ballast outside the body, or demand more than
   half the statue's mass as counterweight, **reject the configuration** and
   explain why. Do not approximate.
5. If inertia is not locked, recompute and display it.
6. If principal inertia *is* locked, treat the result as an abstract probe and
   label it as such.

---

## How internal ballast works

Ballast is a **mass, not a shape**. It is applied through Rapier's *additional*
mass properties, which are summed with the properties derived from the
colliders. No collider is added, moved, resized or re-densified, so a ballasted
statue's contact behaviour is provably identical to the same statue without it —
asserted by a test that compares the collider sets directly. The only thing that
changes is where the mass sits.

The algebra is short and explains why some targets are simply unreachable. With
total mass `M`, ballast fraction `f = m_b/M`, and the geometry's own centre of
mass `c_g`:

```
M·c = M(1-f)·c_g + M·f·p_b     =>     p_b = c_g + (c - c_g) / f
```

The ballast's offset from the geometry's COM is the requested shift **divided by
the ballast fraction**. A small ballast must sit far away, and there is a hard
floor on `f` set by how far the body extends in that direction.

"Inside the body" means inside the base, the torso or the head — *not* inside
the box that encloses all three. The distinction is not academic: a
wide-based statue's bounding box is mostly empty air at shoulder height, and an
early version of this code placed B0's ballast 9 cm outside the torso while
reporting it as internal. The containment test now walks the actual base
footprint polygon, the leaned torso box and the head sphere.

The **smallest workable ballast fraction** is chosen deliberately: it disturbs
the geometry's own mass the least, leaving as much of the body as possible the
shape it claims to be. Measured for the default statue under Matched Moai
Candidate Trial, ballast runs from 1.5% of total mass (A5) to 11.7% (A4).

Ballast is drawn in the collider overlay in its own colour, sized by how much
mass it carries, with its own visibility toggle. A normalised statue must never
look identical to an un-normalised one.

---

## Physically self-consistent versus abstract

A **physically self-consistent** comparison uses geometric scaling and internal
ballast only. The result is a real rigid body: a shape of some density with a
weight bolted inside it. Everything you could measure about it — mass, COM,
inertia, contact — follows from that arrangement. All six presets produce
self-consistent bodies.

An **abstract** comparison uses the mass-property override, which replaces the
derived properties outright. Two paths lead there:

- The Step 1 **COM override**, intended for raw-geometry sweeps where COM is the
  independent variable. Matched mode **switches it off on entry** and says so:
  normalising against a body whose mass distribution is already a probe would
  make the comparison meaningless.
- **Locking principal inertia.** Matching mass, COM *and* the full inertia
  tensor across unlike shapes generally requires an internal mass distribution
  that no real arrangement of the statue's material would produce. When this
  lock is on, the app labels the result:

  > Abstract mass-normalized comparison: COM is constrained independently of the
  > collider-derived inertia.

Prefer ballast. Reach for the abstract path only when inertia genuinely is the
variable under study, and read the results as exploring a parameter axis rather
than as simulating a buildable statue.

---

## Which constraints can become invalid

Invalidity is a real state with real causes, not a defensive placeholder:

- **Base height on a cylindrical rocker (A4).** Its height *is* its width. With
  width locked, height is determined, and no parameter can move it. Matched
  Envelope is therefore invalid for A4.
- **Base height on the fore-aft rocker (B5).** Its height is its lateral radius
  plus the fore-aft rise. At the default width the reachable range is 0.595 m to
  1.619 m, and a 0.560 m target lies below all of it. Matched Envelope is
  invalid for B5 too — and the message says exactly that, including the range.
- **A COM target too far from a family's own.** Rejected when the ballast would
  have to sit outside the body, or exceed 50% of total mass.
- **A dimension target outside the schema's supported range** at the current
  statue height.
- **An over-constrained volume lock**, where every dimension that could absorb
  it is locked too.
- **Environment drift.** If a locked road, rope, tension or solver setting is
  changed after the baseline was captured, the comparison goes invalid and names
  the quantity and both values. This one is easy to cause by accident and
  invisible without the check.

In every case the scenario is marked invalid, the cause is explained, the other
locked quantities are left alone, and the statue is still built as a valid,
stable body — an invalid comparison must not also be a crash.

---

## Why B2/B3 are the valid mirror-control pair

B3 is generated as B2's exact fore-aft reflection — the same polytope with x
negated and its winding reversed — not hand-written to resemble one. Under every
matched preset the pair comes out with identical height, mass, width, length,
volume, and mirrored centroids, and when the COM target lies on the mirror plane
(as A0's does, at x = 0) their ballast is placed at equal and opposite offsets:
measured, 175.6 kg at x = ∓0.241 m.

**Stated explicitly, because it is a real limitation of the method:** if the COM
target is itself off the mirror plane, the normalised pair is no longer
mirror-symmetric — it cannot be, since the constraint isn't. B3 matched against
an off-plane target is the mirror of B2 matched against the *reflected* target,
which is asserted by test. Keep candidate-trial COM targets on x = 0.

## Why B0, B4 and B6 have no exact fore-aft mirror control

A D-shape's rounded nose and flat transom are intrinsic to the outline. No
setting of the shared parameters reflects it — negating the front/back asymmetry
merely makes the nose shorter while leaving it at the front. There is no
mirrored D-family in this phase, so `foreAftMirrorParams` returns null for these
three and the diagnostics panel flags them:
`NO EXACT MIRROR CONTROL`.

A mirrored control that is not actually a mirror would silently invalidate the
trial it was run to validate, which is worse than not having one. Any
forward-advance result on B0, B4 or B6 cannot be mirror-tested here; B2/B3 and
B5 can be, and are the families candidate trials should use.

---

## Tolerances

| Quantity | Tolerance |
|---|---|
| Dimensions (height, width, length, base height) | 0.1 mm |
| Total and base mass | 0.01% relative |
| Centre of mass | 0.1 mm |
| Base volume | 0.1% relative |
| Principal inertia (when locked) | 0.1% relative |
| B2/B3 mirror consistency | the existing strict geometric tolerance from Step 2 |

Measured against these, every family under Matched Moai Candidate Trial lands on
total mass 4000.000 kg and COM (0, 0, 1.6485) m to within floating-point noise —
the largest COM error observed was 2.2 x 10⁻¹⁶ m.

---

## The comparison workflow

1. Choose a baseline family — A0 by default — and **Capture baseline**. This
   snapshots its parameters and environment and issues a `comparisonGroupId`.
2. Choose a candidate family.
3. Apply a named preset. Targets come from the captured baseline.
4. Read the banner and the table: every lock's target, achieved value, error,
   status and method.
5. **Capture candidate** to save it alongside the baseline.
6. Switch between the two with **Load baseline** / **Load candidate**. Each
   restores its statue and environment while leaving the shared constraints
   alone — that separation is the point.

Exported comparisons carry the `comparisonGroupId`, the preset, the full lock
configuration, both scenarios and the candidate's verdict, so a result recorded
later can be tied to the exact conditions it was produced under rather than to a
remembered intention.

Simultaneous two-viewport simulation is deliberately not implemented: a robust
saved baseline/candidate workflow does the same job without complicating the
engine.

---

## What Step 3 does not do

It does not run experiments, measure displacement, apply pulse or feedback
control, or say anything about walking. It makes a fair comparison *possible*.
Interpreting apparent performance without one would be measuring mass, footprint
and centre of mass while believing you were measuring shape — which is precisely
the error this document exists to prevent.
