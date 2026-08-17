# EXPERIMENT_PROTOCOL — Walking Statues

Not implemented yet. This will document how to run a reproducible
comparison — matched-comparison mode, scenario presets, seeded batch
sweeps, and the Pareto/weighted-objective views — once those exist
(Phases 3–4; see [PLAN.md](./PLAN.md)).

For now, the only reproducibility available is manual: every control in
the app has a fixed default (`src/statue/defaults.ts`,
`src/state/store.ts`), and a scenario is fully described by the set of
slider values in [PARAMETER_REFERENCE.md](./PARAMETER_REFERENCE.md).
JSON scenario export, so a run can be described and reproduced without
manually re-entering every slider, is Phase 3 work.
