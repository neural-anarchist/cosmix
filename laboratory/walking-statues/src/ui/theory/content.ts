export interface TheoryParagraph {
  text: string;
  variant?: "callout" | "caveat";
}

export interface TheorySectionContent {
  heading: string;
  paragraphs: TheoryParagraph[];
}

export const THEORY_INTRO = String.raw`This covers what Phase 1 actually implements: the rigid-body equations of
motion, the fixed-timestep integration method, and the two base families'
distinct stability conditions. Rope work/energy accounting, the remaining
base families, and the alternating pulling protocols (P0-P5) get their own
theory as they land — see PHYSICS_MODEL.md for the living, canonical list of
what is simulated versus approximated.`;

export const THEORY_CONTENT: TheorySectionContent[] = [
  {
    heading: "1 · Coordinate convention and state",
    paragraphs: [
      {
        text: String.raw`The simulation state is the pose of a single rigid body: the position of
its reference origin (the base's bottom-center) in world coordinates, plus
an orientation quaternion. Axes follow the project convention everywhere —
forward $x$, lateral $y$, vertical $z$ — applied natively in both Rapier
and Three.js rather than converted at the render boundary (see
ARCHITECTURE.md, "Coordinate convention").`
      },
      {
        text: String.raw`Roll and pitch are read back from that quaternion via an 'XYZ'-ordered
Euler decomposition: $\text{roll} = \theta_x$, $\text{pitch} = \theta_y$,
$\text{yaw} = \theta_z$. This is an approximation — any three-angle
decomposition degenerates near gimbal lock — acceptable here because the
crude fallen-state threshold (60°, Phase 1's placeholder) is crossed well
before that regime.`
      }
    ]
  },
  {
    heading: "2 · Rigid-body equations of motion",
    paragraphs: [
      {
        text: String.raw`Nothing in this project computes a trajectory directly. Every fixed step,
the engine supplies gravity, contact, and rope forces to Rapier's solver
and lets it integrate the standard Newton-Euler equations for a free rigid
body: translational motion of the center of mass,`
      },
      {
        text: String.raw`$$M\,\mathbf{a}_{COM} \;=\; \mathbf{F}_g + \mathbf{F}_N + \mathbf{F}_{friction} + \mathbf{F}_{rope,L} + \mathbf{F}_{rope,R}$$`
      },
      {
        text: String.raw`and rotation about the center of mass, in body frame,`
      },
      {
        text: String.raw`$$\mathbf{I}\,\dot{\boldsymbol\omega} + \boldsymbol\omega \times (\mathbf{I}\,\boldsymbol\omega) \;=\; \boldsymbol\tau_{ext}$$`
      },
      {
        text: String.raw`$M$, $\mathbf{I}$ (about the COM), and the COM location itself are never
hand-specified: they fall out of the collider shapes and per-collider
densities assigned in statue/factory.ts from the base/torso/head mass
fractions, exactly as the "explicit mass distribution, COM, and inertia
reporting" requirement asks. Read them back from Rapier — via
worldCom(), mass(), and principalInertia() — in the readouts rather than
re-deriving them by hand.`
      }
    ]
  },
  {
    heading: "3 · Fixed-timestep integration",
    paragraphs: [
      {
        text: String.raw`Physics steps at a fixed $\Delta t = 1/240$ s regardless of display frame
rate, accumulated in a while-loop (src/core/SimulationEngine.ts) so the
dynamics never depend on how fast the tab happens to render. Between
physics steps, the display interpolates the two most recent poses — lerp
for position, slerp for orientation — so motion reads smoothly even when
render rate and 240 Hz don't divide evenly.`
      },
      {
        text: String.raw`Rapier resolves free motion with a semi-implicit ("symplectic") Euler
step — velocities update from accumulated forces first, positions update
from the new velocities — and resolves contact and friction as
velocity-level impulse constraints solved iteratively within the step.
That is standard practice for real-time rigid-body engines and is not a
substitute for a validated multibody-dynamics tool. The project's planned
numerical-credibility checks (comparing this $\Delta t$ against $\Delta t/2$,
Phase 4) and the eventual MuJoCo-WASM cross-check exist specifically to
quantify how much this approximation matters for this system.`,
        variant: "caveat"
      }
    ]
  },
  {
    heading: "4 · Static tipping condition — flat base (A0)",
    paragraphs: [
      {
        text: String.raw`A flat-bottomed base rotating rigidly about its downhill bottom corner has
exactly one point that can exert a restoring torque: that corner. In the
upright pose the COM sits a horizontal distance $W_{base}/2$ and a vertical
distance $z_{COM}$ from it (both fixed body-frame quantities, the second
read live from Rapier). Rotating the body by roll angle $\theta$ about the
corner carries the COM to a world-frame horizontal offset from the corner
of`
      },
      {
        text: String.raw`$$\Delta y_{COM}(\theta) \;=\; \frac{W_{base}}{2}\cos\theta \;-\; z_{COM}\sin\theta$$`
      },
      {
        text: String.raw`which crosses zero — weight passes exactly over the pivot corner, and
gravity's torque about it vanishes — at`
      },
      {
        text: String.raw`$$\boxed{\;\theta_{crit} \;=\; \arctan\!\left(\dfrac{W_{base}/2}{z_{COM}}\right)\;}$$`
      },
      {
        text: String.raw`Past $\theta_{crit}$, gravity's torque about that corner flips from
restoring (rocks the statue back down) to overturning (continues the
fall) — the classic rigid-block tipping result, exact for rotation about a
fixed corner rather than a small-angle approximation. The live diagram
alongside marks this angle for the statue's current geometry and reported
COM height.`
      }
    ]
  },
  {
    heading: "5 · Rocking/rolling stability — lateral rocker (A4)",
    paragraphs: [
      {
        text: String.raw`A4's circular cross-section has no corner to pivot about: contact is a
single point, in this cross-section, that migrates around the circle as
the body rolls, so there is no fixed $\theta_{crit}$. The qualitative
condition instead is that gravity keeps restoring the roll as long as the
COM's world-frame horizontal position stays behind the rolling contact
point; once an applied rope force rolls the base far enough that the COM's
line of action passes beyond the contact point, gravity continues the roll
rather than opposing it.`
      },
      {
        text: String.raw`That condition — not a fixed angle — is what actually limits how far a
rope pull can safely rock this base. Phase 1 leaves A4 as a full 360°
cylinder (see statue/bases/a4-lateralRocker.ts) precisely so this is the
only limit in play, rather than a heel/toe facet artificially capping the
roll — a documented simplification, not a hidden one.`,
        variant: "caveat"
      },
      {
        text: String.raw`Working out that condition for rolling without slipping gives a clean
closed form. With cylinder radius $R$ and $a = z_{COM} - R$ the COM's
offset above the cylinder's own center, the potential energy at roll angle
$\theta$ is $U(\theta) = Mg(R + a\cos\theta)$, so $\theta = 0$ is stable
only if $a < 0$ — the COM must sit below the rocker's center, exactly the
weeble-toy condition. For $H$-scale statue proportions the COM sits at
roughly half the total height, and keeping $R$ above that would mean a
rocker wider than the statue is tall. A4 is therefore passively unstable at
realistic scale by construction, not by a tuning accident: release it and
it rolls away rather than settling, which is why the default preset uses
A0 instead and why this family's whole premise depends on continuous,
alternating rope tension rather than a statue left to rock on its own —
the human handlers are the control loop.`,
        variant: "callout"
      }
    ]
  },
  {
    heading: "6 · The rope model: geometry, not an axis",
    paragraphs: [
      {
        text: String.raw`A rope is defined by two points, and everything else is derived from them:
where the haulers stand, $\mathbf{p}_{ext}$, fixed in the world; and where
the rope is tied to the statue, $\mathbf{p}_{att}$, fixed in the body and
carried along as it rolls. The direction a taut rope can pull is then just
the line between them,`
      },
      {
        text: String.raw`$$\hat{\mathbf{d}} \;=\; \frac{\mathbf{p}_{ext} - \mathbf{p}_{att}}{\lVert \mathbf{p}_{ext} - \mathbf{p}_{att} \rVert}, \qquad \mathbf{F} \;=\; T\,\hat{\mathbf{d}}$$`
      },
      {
        text: String.raw`This makes the model tension-only by construction: $\mathbf{F}$ always
points from the statue toward the haulers, so there is no way to express a
rope that pushes. It also means the force has genuine lateral, forward and
vertical components determined by where the haulers actually stand — the
default arrangement gives roughly $\hat{\mathbf{d}} \approx (0.46, \pm
0.76, -0.46)$. Both the rendered rope and the force arrow are drawn from
this same solution, so the picture cannot disagree with the physics.`
      },
      {
        text: String.raw`Applied at $\mathbf{p}_{att}$ rather than at the center of mass, the force
exerts a torque about the COM of`
      },
      {
        text: String.raw`$$\boldsymbol{\tau} \;=\; (\mathbf{p}_{att} - \mathbf{r}_{COM}) \times \mathbf{F}$$`
      },
      {
        text: String.raw`Pulling one side rolls the statue toward that side; releasing and pulling
the other reverses it. Manual hold-to-pull control is Phase 1's entire
pulling model — the scripted alternation (P1), angle-feedback PD control
(P3), and the rest of the P0-P5 protocol set are Phase 2 (see PLAN.md).`
      },
      {
        text: String.raw`Nothing here adds a forward push. A rope may have a forward component, but
that is a force, not a displacement: any forward progress has to come from
the interaction of lateral rocking with the base geometry, friction, and
gravity. That is the whole hypothesis under test.`,
        variant: "callout"
      }
    ]
  },
  {
    heading: "7 · When does it move at all? Two static thresholds",
    paragraphs: [
      {
        text: String.raw`Before any rocking can happen, the pull has to overcome static equilibrium,
and there are two independent ways for it to fail. The base can slide, once
the horizontal pull exceeds what friction can hold:`
      },
      {
        text: String.raw`$$F_{slide} \;=\; \mu_s\,M g$$`
      },
      {
        text: String.raw`Or it can tip about the downwind edge of its footprint, once the pull's
moment about that edge exceeds the weight's restoring moment. With the base
half-width $b$ and the attachment at height $z_a$, balancing
$F\,z_a$ against $Mg\,b$ gives`
      },
      {
        text: String.raw`$$F_{tip} \;=\; \frac{M g\, b}{z_a}$$`
      },
      {
        text: String.raw`Whichever is smaller governs. Below $\min(F_{slide}, F_{tip})$ the statue
must simply stay put, and the "Run static equilibrium benchmark" button
checks exactly that: it holds 50% of the governing threshold for 5 s and
requires the statue to move less than 0.5 mm and rotate less than 0.05°.
The force-ramp button then walks the tension up to 125% and reports the
first level at which real motion begins, alongside both predictions.`
      },
      {
        text: String.raw`Which threshold governs is what decides the *character* of the failure, and
it is under your control. Raise $\mu$ and $F_{tip} < F_{slide}$, so the
statue rocks — that is the regime this project needs. Lower $\mu$ and
$F_{slide} < F_{tip}$, so it slides flat instead, and no amount of pulling
will rock it. Measured onsets agree with both predictions to within one 5%
ramp step.`
      },
      {
        text: String.raw`Both formulas above assume a purely horizontal pull, which is why the
benchmarks arrange the rope that way. A rope angled downward presses the
statue into the road, raising $F_{slide}$ (more normal load) and $F_{tip}$
(the vertical component resists rotation about the edge). The diagnostics
panel therefore reports the reference values and the geometry-aware values
for the actual rope direction side by side, rather than quoting one and
hoping the difference is small.`,
        variant: "caveat"
      },
      {
        text: String.raw`Note that $F_{tip}$ requires a finite $b$. A rocker base (A4) touches along
a line, so $b = 0$: there is no static tipping threshold to exceed, and no
tipping angle. This is the same fact as §5's instability result seen from a
different direction, and it is why the benchmark reports "not applicable"
rather than a number when A4 is selected.`
      }
    ]
  }
];
