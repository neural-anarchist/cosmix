import { PHASE1_BASELINE } from "../benchmark/baseline";

/**
 * A permanent, non-dismissible statement of what the reference negative-control
 * result is and is not. It sits directly under the viewport rather than in a
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
        <span className="baseline-badge">Reference case</span>
        Not a forward-walking model
      </h3>
      <ul>
        <li>
          <strong>The two symmetric base shapes (a plain box and a smooth
          cylinder), on a flat symmetric road under symmetric pulling, are
          reference cases.</strong> They exist to check that contact, static
          equilibrium, sliding and lateral rocking behave the way the model
          says they should — not to demonstrate that a statue can be walked.
        </li>
        <li>
          <strong>Directed forward motion is never imposed.</strong> Nothing in
          this simulation writes a forward position, a forward velocity, or a
          forward push directly onto the body. Forward displacement can only
          arise from rigid-body dynamics, geometry, gravity, contact, friction
          and rope tension.
        </li>
        <li>
          <strong>The reference forward-displacement baseline, used as a
          negative control:</strong> approximately{" "}
          <code>{(PHASE1_BASELINE.forwardM * 1000).toFixed(2)} mm</code> of
          forward motion against approximately{" "}
          <code>{PHASE1_BASELINE.lateralM.toFixed(2)} m</code> of sideways
          motion in one driven run. That is effectively zero forward progress,
          and it is the number any later walking claim must substantially
          exceed.
        </li>
        <li>
          <strong>Left/right differences are small but not exactly zero.</strong>{" "}
          The physics engine does not treat left and right identically inside
          its solver, so mirrored trials agree to about 1%. That is acceptable
          only while it stays within the{" "}
          <code>{(PHASE1_BASELINE.mirrorRelTolerance * 100).toFixed(0)}%</code>{" "}
          bound checked automatically.
        </li>
        <li>
          <strong>A claimed walking result must survive mirrored-control
          tests</strong> — mirrored base geometry, mirrored rope control, and
          left/right reversal — as well as a check that the result doesn't
          change with a finer timestep, before it counts as anything more than
          exploratory behavior.
        </li>
      </ul>
    </aside>
  );
}
