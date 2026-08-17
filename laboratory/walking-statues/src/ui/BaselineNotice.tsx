import { PHASE1_BASELINE } from "../benchmark/baseline";

/**
 * A permanent, non-dismissible statement of what the validated Phase 1 result
 * is and is not. It sits directly under the viewport rather than in a
 * collapsible panel because its whole purpose is to be read by someone who
 * watches the statue rock and concludes it is walking.
 *
 * The numbers come from `benchmark/baseline.ts`, the same constants the
 * forward-advance classifier compares against, so the figure quoted to the
 * reader and the figure the code judges against cannot drift apart.
 */
export function BaselineNotice() {
  return (
    <aside className="baseline-notice">
      <h3>
        <span className="baseline-badge">Validation model</span>
        Not a forward-walking model
      </h3>
      <ul>
        <li>
          <strong>A0 and A4 on a flat, symmetric road under symmetric forcing are
          validation models.</strong> They exist to prove that contact, static
          equilibrium, sliding and lateral rocking behave correctly — not to
          demonstrate that a statue can be walked.
        </li>
        <li>
          <strong>Directed forward motion is never imposed.</strong> Nothing in
          this simulation writes an x position, an x velocity, or a forward
          impulse. Forward displacement can only arise from rigid-body dynamics,
          geometry, gravity, contact, friction and rope tension.
        </li>
        <li>
          <strong>Phase 1 forward displacement is the negative-control
          baseline:</strong> approximately{" "}
          <code>{(PHASE1_BASELINE.forwardM * 1000).toFixed(2)} mm</code> in x
          against approximately <code>{PHASE1_BASELINE.lateralM.toFixed(2)} m</code>{" "}
          in y under the driven case. That is effectively zero forward progress,
          and it is the number any later walking claim must substantially exceed.
        </li>
        <li>
          <strong>Left/right contact asymmetry is bounded, not absent.</strong>{" "}
          Rapier's contact-constraint ordering is not mirror-symmetric, so
          mirrored trials agree to about 1%. This is acceptable only while it
          stays within the{" "}
          <code>{(PHASE1_BASELINE.mirrorRelTolerance * 100).toFixed(0)}%</code>{" "}
          regression bound.
        </li>
        <li>
          <strong>A claimed walking result must survive mirrored-control
          tests</strong> — mirrored base geometry, mirrored rope control, and
          left/right reversal — as well as timestep refinement, before it counts
          as anything more than exploratory behaviour.
        </li>
      </ul>
    </aside>
  );
}
