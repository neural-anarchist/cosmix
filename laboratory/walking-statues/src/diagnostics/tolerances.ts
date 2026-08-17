/**
 * Quantitative definition of "at rest".
 *
 * A rigid-body solver never produces exactly zero motion, so "the statue
 * stayed put" has to be a number, not a judgement. These are the tolerances
 * the static-equilibrium benchmark asserts against, and they are surfaced in
 * the diagnostics panel next to the live values so the margin is always
 * visible rather than implied.
 *
 * The defaults are the ones specified for Phase 1. Measured margin on the
 * default statue at 50% of the governing threshold is roughly 18x on
 * displacement and 40x on roll, so these are not tuned to just barely pass.
 */
export interface RestTolerances {
  /** Max lateral COM displacement over the hold window, meters. */
  displacementM: number;
  /** Max change in roll angle over the hold window, degrees. */
  rollDeg: number;
  /** Max linear speed after settling, m/s. */
  speedMps: number;
  /** Max angular speed after settling, deg/s. */
  angularSpeedDegPerS: number;
}

export const DEFAULT_REST_TOLERANCES: RestTolerances = {
  displacementM: 0.0005, // 0.5 mm
  rollDeg: 0.05,
  speedMps: 0.001, // 1 mm/s
  angularSpeedDegPerS: 0.1
};

/**
 * Motion thresholds used to *classify* what the statue is doing, as distinct
 * from the tighter rest tolerances above used to decide whether it held still.
 * These sit deliberately above the rest tolerances so a body sitting inside
 * the rest band never flickers into a motion regime.
 */
export interface RegimeThresholds {
  /** Above this linear speed, the statue counts as translating. */
  slidingSpeedMps: number;
  /** Above this angular speed, the statue counts as rocking. */
  rockingAngularSpeedDegPerS: number;
  /**
   * Roll angle past which a flat base has committed to falling. Defaults to
   * the geometry's own static tipping angle when one exists; this value is the
   * fallback for a rocker base, which has no static tipping angle.
   */
  rockerTopplingRollDeg: number;
}

export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = {
  slidingSpeedMps: 0.005,
  rockingAngularSpeedDegPerS: 1.0,
  rockerTopplingRollDeg: 60
};
