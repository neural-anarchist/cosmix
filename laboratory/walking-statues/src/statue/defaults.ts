import type { StatueParams } from "./types";

export const DEFAULT_STATUE_PARAMS: StatueParams = {
  heightM: 3.5,
  totalMassKg: 4000,

  // A0 is the default rather than A4: a tall statue's COM sits well above
  // any realistic rocker radius, which makes a free cylindrical rocker
  // passively *unstable* at rest (see Theory section 5 / PHYSICS_MODEL.md)
  // — a real and important finding, but a poor out-of-the-box first
  // impression. A4 is one dropdown selection away.
  baseFamily: "A0",
  baseWidthRatio: 0.32,
  baseLengthRatio: 0.22,
  baseHeightRatio: 0.16,

  baseMassFraction: 0.35,
  headMassFraction: 0.25,

  torsoWidthRatio: 0.22,
  torsoDepthRatio: 0.16,

  linearDampingSI: 0.05,
  angularDampingSI: 0.15
};
