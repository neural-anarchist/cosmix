import type { StatueParams } from "./types";

/**
 * The exact configuration Phase 1's benchmarks were validated against:
 * a uniform (untapered) box torso, no intrinsic lean, and no COM override, so
 * the compound collider set is bit-identical to the one that produced the
 * validated static-equilibrium, force-ramp, sliding and rocking results.
 *
 * The Phase-1 regression tests point at *this* rather than at
 * DEFAULT_STATUE_PARAMS on purpose. Defaults are allowed to evolve as the
 * statue model gets richer; the validated baseline is not, and pinning the
 * regressions to a moving default would quietly change what they certify.
 */
export const PHASE1_BASELINE_STATUE_PARAMS: StatueParams = {
  heightM: 3.5,
  totalMassKg: 4000,

  baseFamily: "A0",
  baseWidthRatio: 0.32,
  baseLengthRatio: 0.22,
  baseHeightRatio: 0.16,

  // Every shape control added in Step 2 defaults to a value A0 does not read,
  // or to zero. The Phase 1 baseline is therefore bit-identical under the
  // extended schema: A0 declares that it reads only width, length, height and
  // mass fraction, so nothing below can reach its collider.
  baseLateralRadiusRatio: 0.16,
  baseForeAftRadiusRatio: 0.08,
  baseEdgeRoundingRatio: 0.03,
  baseFrontBackAsymmetry: 0,
  baseLeftRightAsymmetry: 0,
  baseOffsetXRatio: 0,
  baseForwardLeanDeg: 0,

  baseMassFraction: 0.35,
  headMassFraction: 0.25,

  torsoWidthRatio: 0.22,
  torsoDepthRatio: 0.16,
  torsoTaper: 0,

  forwardLeanDeg: 0,

  comOverrideEnabled: false,
  comOffsetXRatio: 0,
  comOffsetYRatio: 0,
  comHeightRatio: 0.471,

  visualDetail: "medium",

  ballast: null,

  linearDampingSI: 0.05,
  angularDampingSI: 0.15
};

export const DEFAULT_STATUE_PARAMS: StatueParams = {
  ...PHASE1_BASELINE_STATUE_PARAMS,

  // A0 is the default rather than A4: a tall statue's COM sits well above
  // any realistic rocker radius, which makes a free cylindrical rocker
  // passively *unstable* at rest (see Theory section 5 / PHYSICS_MODEL.md)
  // — a real and important finding, but a poor out-of-the-box first
  // impression. A4 is one dropdown selection away.
  baseFamily: "A0",

  // Modest taper so the default statue reads as a Moai rather than a crate.
  // This does move the COM relative to the Phase 1 baseline, which is why the
  // baseline is preserved as its own named configuration above.
  torsoTaper: 0.22
};
