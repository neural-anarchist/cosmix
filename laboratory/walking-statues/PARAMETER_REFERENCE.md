# PARAMETER_REFERENCE — Walking Statues

Documents the parameters that actually exist in the running app. This is
Phase 1's subset of the full parameter set specified for the project; it
grows with each phase rather than being written once against the full
spec up front. Defaults live in `src/statue/defaults.ts` and
`src/state/store.ts`.

## Statue & mass

| Control | Symbol | Units | Range | Default | Notes |
|---|---|---|---|---|---|
| Height H | $H$ | m | 1.5–7 | 3.5 | Base to crown. |
| Mass M | $M$ | kg | 500–14000 | 4000 | Total statue mass. |
| Base mass fraction | — | — | 0.05–0.75 | 0.35 | Fraction of $M$ assigned to the base collider(s). |
| Head mass fraction | — | — | 0.05–0.5 | 0.25 | Fraction of $M$ assigned to the head. Remainder goes to the torso. |
| Torso width / H | — | — | 0.08–0.4 | 0.22 | Phase 1 torso is a simple box. |
| Torso depth / H | — | — | 0.08–0.4 | 0.16 | |

## Base geometry

| Control | Units | Range | Default | Notes |
|---|---|---|---|---|
| Base family | — | A0, A4 (A5/B0/B2/B6 shown disabled) | A0 | See ARCHITECTURE.md for the registry pattern. |
| Base width / H ($W_{base}/H$) | — | 0.12–0.6 | 0.32 | For A4 this is the rocker's full diameter. |
| Base length / H ($L_{base}/H$) | — | 0.1–0.5 | 0.22 | Extent along x for both families. |
| Base height / H ($H_{base}/H$) | — | 0.06–0.35 | 0.16 | A0 only — disabled for A4, whose height is fixed by its radius. |

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
