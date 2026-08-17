# CALIBRATION_GUIDE — Walking Statues

Not implemented yet. Calibration mode — loading measured mass/COM/friction
values and rope-force or pose CSV time series, overlaying them against the
simulation, and exporting scenario/summary data — is Phase 5 work (see
[PLAN.md](./PLAN.md)).

The intended calibration sequence, for reference when that phase starts:

1. Geometry / mass / COM — verify the statue factory's reported mass,
   COM, and inertia against measured or modeled values before touching
   dynamics at all.
2. Unforced rocking decay — release from a known tilt with no rope input
   and compare decay behavior against measurement.
3. Friction sliding — a controlled slide test to pin down the
   friction coefficient(s).
4. Single-rope pull — validate the direct force model against one
   measured pull.
5. Alternating rope walking — validate a full walking sequence once a
   pulling protocol exists (Phase 2).
6. Held-out validation geometry/protocol — a case not used to tune
   anything, run once at the end to check the model generalizes.

Nothing below step 1 can be built until the corresponding subsystem
(export, CSV import, overlay charts) exists. This file will be filled in
alongside that work rather than describing a workflow that doesn't run yet.
