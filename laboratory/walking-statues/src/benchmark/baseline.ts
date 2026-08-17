/**
 * The frozen Phase 1 negative-control baseline.
 *
 * Measured on the validated Phase 1 A0 configuration driven at 1.4x its tipping
 * threshold for 2 s: the statue advanced 0.15 mm along x while moving 0.63 m
 * along y. Friction pins the contact patch fore-aft while the body rotates about
 * a lateral edge, and a fore-aft symmetric base has nothing to convert that
 * rocking into a preferred direction.
 *
 * These constants exist in one place so that the figure shown to the reader in
 * the UI, the threshold the forward-advance classifier uses, and the number
 * quoted in the documentation cannot drift apart. Treat them as a recorded
 * measurement, not a tunable: changing them changes what counts as walking.
 */
export const PHASE1_BASELINE = {
  /** Forward (x) COM displacement, meters. Effectively zero. */
  forwardM: 0.00015,
  /** Lateral (y) COM displacement over the same run, meters. */
  lateralM: 0.63,
  /** Statue height the baseline was measured at, meters. */
  heightM: 3.5,
  /**
   * Relative tolerance within which mirrored left/right trials must agree.
   * Rapier's constraint ordering is not mirror-symmetric; measured error peaks
   * at 2.6% and shrinks as motion grows, so 5% is a deliberately generous bound
   * rather than a fitted one.
   */
  mirrorRelTolerance: 0.05,
  /**
   * Multiple of the baseline forward displacement that a run must exceed before
   * its forward motion can be attributed to geometry rather than to solver
   * noise. Deliberately large: the baseline is a noise floor, not a rival
   * result, so clearing it by a hair means nothing.
   */
  forwardAdvanceFactor: 20
} as const;

/** The forward displacement a run must exceed to be considered real advance. */
export const forwardAdvanceThresholdM = (): number =>
  PHASE1_BASELINE.forwardM * PHASE1_BASELINE.forwardAdvanceFactor;
