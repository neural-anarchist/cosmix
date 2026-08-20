# PARAMETER_REFERENCE — Walking Statues

Documents the parameters that actually exist in the running app — currently
Phase 1 plus Phase 2 Steps 1 and 2. It grows with each phase rather than being written
once against the full spec up front, so anything absent here is genuinely
absent from the code. Defaults live in `src/statue/defaults.ts` and
`src/state/store.ts`.

## Statue & mass

| Control | Symbol | Units | Range | Default | Notes |
|---|---|---|---|---|---|
| Height H | $H$ | m | 1.5–7 | 3.5 | Base to crown. |
| Mass M | $M$ | kg | 500–14000 | 4000 | Total statue mass. |
| Base mass fraction | — | — | 0.05–0.75 | 0.35 | Fraction of $M$ assigned to the base collider(s). |
| Head mass fraction | — | — | 0.05–0.5 | 0.25 | Fraction of $M$ assigned to the head. Remainder goes to the torso. |
| Shoulder width / H | — | — | 0.08–0.4 | 0.22 | Torso width (y) at the shoulders, the widest point of the upper body. |
| Body depth / H | — | — | 0.08–0.4 | 0.16 | Torso depth (x) at the shoulders. |
| Torso taper | — | — | 0–0.6 | 0.22 | Fractional narrowing from shoulders downward: `bottom = top x (1 - taper)`. **Mechanical, not cosmetic** — changes the collider cross-section and the inertia tensor. 0 reproduces the validated Phase 1 box exactly. |
| Forward lean | $\theta_{lean}$ | deg | −15–30 | 0 | Intrinsic lean of the **upper body only**, pivoting at the top of the base so ground contact is unaffected. Distinct from dynamic pitch; both are reported separately. |

## Center of mass

| Control | Symbol | Units | Range | Default | Notes |
|---|---|---|---|---|---|
| Override COM explicitly | — | — | on/off | off | When off, COM is derived from geometry and density. When on, the derived mass properties are discarded and the COM is forced to the offsets below. |
| Forward COM offset x/H | $x_{COM}/H$ | — | −0.15–0.15 | 0 | Only applied when the override is on. |
| Lateral COM offset y/H | $y_{COM}/H$ | — | −0.15–0.15 | 0 | Only applied when the override is on. |
| COM height z/H | $z_{COM}/H$ | — | 0.15–0.8 | 0.471 | Only applied when the override is on. |

An overridden COM keeps every collider *shape* unchanged, so contact behaviour
is unaffected, but the rotational inertia is carried over from the derived
configuration rather than recomputed. That makes an overridden statue an
**abstract probe, not a self-consistent rigid body** — its mass distribution
corresponds to no real arrangement of its own geometry. The COM marker turns
violet and the diagnostics label it accordingly. See
PHASE2_GEOMETRY_AND_CONTROL.md.

## Visual detail

| Control | Units | Range | Default | Notes |
|---|---|---|---|---|
| Tessellation | — | low / medium / high | medium | Mesh triangle counts only. A unit test asserts mass, COM, inertia and the collider set are identical across all three levels, so the displayed statue and the simulated statue can never differ. |

## Base geometry

All twelve families are described against one shared normalized schema. A family
that does not read a parameter has that control **disabled with the reason
shown**, rather than the control silently doing nothing; which parameters a
family reads is declared by the family itself and listed in the diagnostics
panel. Ranges come from `src/statue/bases/shared.ts`, so a slider and its
validator cannot disagree.

| Family | Contact | Reads | Notes |
|---|---|---|---|
| A0 — Flat rectangular prism | flat | W, L, H_b | The validated Phase 1 reference. Exact analytic cuboid. |
| A1 — Rounded rectangular prism | flat | W, L, H_b, r_edge, f_lr | Plan corners rounded; bottom edge stays sharp. |
| A2 — Elliptical prism | flat | W, L, H_b, f_lr | |
| A3 — Capsule / stadium prism | flat | W, L, H_b, f_lr | Caps flatten to semi-ellipses when $L < W$, so both stated dimensions stay exact. Coincides with A2 in that case. |
| A4 — Lateral cylindrical rocker | rocker | W, L | Exact analytic cylinder; the smooth control for the faceted rockers. $R_{lat}$ is defined as $W/2$. |
| A5 — Ellipsoidal rocker | rocker | W, L, R_lat | Height is derived: for an ellipsoid $R_{lat} = b^2/c$, so width, curvature and height are not independent. |
| B0 — D-base | flat | W, L, H_b, f_fb, f_lr | Rounded nose, flat transom. First fore-aft asymmetric family. |
| B2 — Forward teardrop | flat | W, L, H_b, R_fore, f_fb, f_lr | $R_{fore}$ is the tail radius. |
| B3 — Rear teardrop | flat | W, L, H_b, R_fore, f_fb, f_lr | B2's exact reflection, generated from it. The fore-aft mirror control. |
| B4 — Offset D-base | flat | W, L, H_b, f_fb, f_lr, x_base | B0's solid, translated along x. |
| B5 — Fore-aft asymmetric rocker | rocker | W, L, R_fore, f_fb | Rolls laterally like A4; fore-aft profile rises asymmetrically. Mirrors onto itself via $-f_{fb}$. |
| B6 — Moai D-base + angled mount | flat | W, L, H_b, f_fb, f_lr, theta_base | Top face cut at an angle, leaning the upper body without tilting the footprint. |

| Control | Symbol | Units | Range | Default | Notes |
|---|---|---|---|---|---|
| Base width | $W_{base}/H$ | — | 0.12–0.6 | 0.32 | **Always the maximum lateral width**, for every family and every asymmetry. |
| Base length | $L_{base}/H$ | — | 0.1–0.5 | 0.22 | **Always the total fore-aft length.** |
| Base height | $H_{base}/H$ | — | 0.06–0.35 | 0.16 | Not read by the rockers, whose height is fixed by their curvature. |
| Lateral curvature | $R_{lat}/H$ | — | 0.06–0.6 | 0.16 | A5 only. For A4 and B5 the lateral radius *is* $W/2$. |
| Fore-aft curvature | $R_{fore}/H$ | — | 0.02–0.6 | 0.08 | Teardrop tail radius (B2/B3), or fore-aft rolling radius at contact (B5). |
| Edge rounding | $r_{edge}/H$ | — | 0–0.12 | 0.03 | A1 only; plan corners. |
| Front/back asymmetry | $f_{fb}$ | — | −0.8–0.8 | 0 | Splits the length as $(L/2)(1 \pm f)$. **Total length is preserved exactly** — it changes shape, not size. |
| Left/right asymmetry | $f_{lr}$ | — | −0.5–0.5 | 0 | Splits the width as $(W/2)(1 \pm a)$. **Maximum width is preserved exactly.** |
| Base x-offset | $x_{base}/H$ | — | −0.15–0.15 | 0 | B4 only. Shifts the base fore or aft beneath the upper body. |
| Base mount lean | $\theta_{base}$ | deg | −15–30 | 0 | B6 only. The angle the base's top face is cut at. Leans the upper body while leaving ground contact untouched; **adds to** the statue's own forward lean, and both are reported separately from dynamic pitch. |

Out-of-range values sitting in a control a family does not read are **ignored,
not rejected** — carrying one parameter set across families is the point of a
shared schema.

### Collision model

A0 and A4 keep exact analytic primitives. The other ten are triangulated convex
polytopes, and their display mesh is generated from the same triangles, so the
only approximation is a stated facet count: 32 segments per curved outline, 48
across a rocker arc, 13 stations along it. These counts are fixed constants and
are deliberately **not** tied to the Visual detail control — they are the
collider, not decoration.

Flat-bottomed bases are handed to the solver as 8 wedge colliders whose union is
the identical solid. This is a contact-discretisation fix for a measured defect
(Rapier caps solver contacts at four per pair, and a single large flat hull could
collapse its contact patch to 39 mm and start climbing); it changes no geometry,
mass or COM. See PHASE2_GEOMETRY_AND_CONTROL.md for the convergence study.

## Road & contact

| Control | Units | Range | Default | Notes |
|---|---|---|---|---|
| Road length | m | 15–100 | 40 | |
| Road width | m | 2–16 | 6 | |
| Friction coefficient $\mu$ | — | 0.05–1.4 | 0.65 | One shared value, applied to every statue/road contact pair. Rapier's default `Average` combine rule applies, so with both surfaces set identically the effective coefficient equals this value. This is the single most consequential slider for *how* the statue fails: high $\mu$ → tipping/rocking, low $\mu$ → sliding. |
| Restitution | — | 0–0.6 | 0.05 | Contact bounciness. |

Road type is fixed to "flat" in Phase 1; the type/slope/concavity/roughness
fields exist in `RoadParams` (`src/road/types.ts`) for the Phase 3/5
implementations but are not yet exposed or applied.

## Rope geometry & tension

Each rope is two points, and the force direction is derived from them rather
than being a fixed axis (see PHYSICS_MODEL.md). Defaults live in
`src/control/ropeDefaults.ts`. All coordinates use the project convention:
**x forward, y lateral (+ is left), z up**.

| Control | Symbol | Units | Range | Default | Notes |
|---|---|---|---|---|---|
| Rope tension T | $T$ | N | 200–40000 | 3000 | Applied along the rope while that side is hauled. Shown alongside $T/Mg$. Default is deliberately **below** the default statue's 8969 N tipping threshold, so the out-of-the-box behaviour is a statue that correctly refuses to move. |
| Left haulers x, y, z | $\mathbf{p}_{ext,L}$ | m | free | (1.505, 3.01, 1.19) | World position where the left rope is pulled from. Derived as $(0.43H, 0.86H, 0.34H)$. |
| Right haulers x, y, z | $\mathbf{p}_{ext,R}$ | m | free | (1.505, −3.01, 1.19) | Exact y-mirror of the left. |
| Left attachment x, y, z | $\mathbf{p}_{att,L}$ | m | free | (0, 0.560, 2.450) | Body-local tie point. Derived from torso geometry: $z = z_{base,top} + 0.75\,h_{torso}$, $y = w_{torso}/2 + 0.05H$. |
| Right attachment x, y, z | $\mathbf{p}_{att,R}$ | m | free | (0, −0.560, 2.450) | Exact y-mirror of the left. |

With the defaults this gives $\hat{\mathbf{d}} \approx (0.479, \pm 0.780,
-0.401)$ — lateral-dominant, with modest forward and downward components.

Attachment points follow the statue's geometry automatically when statue
parameters change, **until** you edit any rope coordinate by hand; after that
they stay put (silently overwriting a deliberate value would be worse) and
"Re-snap attachments to statue" restores the tracking. "Restore default
geometry" resets all twelve coordinates.

## Diagnostic tolerances

Set in `src/diagnostics/tolerances.ts`. The rest tolerances define what "did
not move" means for the static-equilibrium benchmark and are displayed
alongside the live values in the diagnostics panel.

| Quantity | Default limit | Notes |
|---|---|---|
| Lateral/forward COM displacement | 0.5 mm | Over the hold window. Measured margin at 50% of threshold: 12×. |
| Roll change | 0.05° | Measured margin: 44×. |
| Linear speed after settling | 1 mm/s | Measured margin: 153×. |
| Angular speed after settling | 0.1 °/s | Measured margin: 468×. |
| Sliding-regime speed | 5 mm/s | Classification only, deliberately above the rest band so a resting body cannot flicker into a motion regime. |
| Rocking-regime angular speed | 1 °/s | Classification only. |
| Rocker toppling roll | 60° | Fallback for a rocker base, which has no static tipping angle. Flat bases use their own derived $\theta_{crit} = \arctan(b/z_{COM})$. |

## Benchmark settings

Set in `src/benchmark/staticEquilibrium.ts` and `forceRamp.ts`. Not
user-adjustable in the UI yet; the buttons run them against whatever statue
and road settings are currently active.

| Setting | Default | Notes |
|---|---|---|
| Static benchmark tension | 50% of $\min(F_{slide}, F_{tip})$ | |
| Static benchmark hold | 5 s | After a 0.5 s unloaded settle. |
| Force-ramp levels | 25, 50, 70, 80, 90, 95, 100, 105, 110, 125% | Each an independent trial from a fresh reset. |
| Force-ramp hold | 3 s per level | |

## Physics quality (not yet user-facing)

Fixed timestep (1/240 s), linear damping (0.05), and angular damping (0.15)
are set in `src/core/constants.ts` and `src/statue/defaults.ts` but have no
UI controls yet — the "Physics Quality" control group and the numerical
dt-vs-dt/2 convergence check are Phase 4 work. Rapier's solver settings are
left at their defaults (4 velocity iterations, 1 internal PGS iteration);
the audit found no evidence they contribute error at this scale.

Note that the damping values are **not** what produces static equilibrium —
that is verified with both set to zero (PHYSICS_MODEL.md).
