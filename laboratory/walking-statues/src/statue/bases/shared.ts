import type { StatueParams } from "../types";

/**
 * The shared, normalized parameter schema every base family is described
 * against.
 *
 * A single schema is what makes families comparable at all: if each shape had
 * its own bespoke knobs, "the same statue on a different base" would be
 * undefined, and any later geometry comparison would be measuring the
 * parameterisation as much as the physics.
 *
 * Not every family consumes every parameter — a flat rectangular prism has no
 * lateral curvature radius, and a cylindrical rocker's height is fixed by its
 * own radius. Rather than silently ignoring the irrelevant ones, each family
 * declares which it reads (`BaseGeometryModule.usesParameters`), the UI greys
 * out the rest, and the diagnostics panel names them. A control that appears
 * to do something but does not is worse than no control.
 */
export const SHARED_BASE_PARAMETER_IDS = [
  "baseWidthRatio",
  "baseLengthRatio",
  "baseHeightRatio",
  "baseLateralRadiusRatio",
  "baseForeAftRadiusRatio",
  "baseEdgeRoundingRatio",
  "baseFrontBackAsymmetry",
  "baseLeftRightAsymmetry",
  "baseOffsetXRatio",
  "baseForwardLeanDeg",
  "baseMassFraction"
] as const;

export type SharedBaseParameterId = (typeof SHARED_BASE_PARAMETER_IDS)[number];

export interface SharedBaseParameterSpec {
  id: SharedBaseParameterId;
  /** Symbol used in the docs and the diagnostics panel. */
  symbol: string;
  label: string;
}

export const SHARED_BASE_PARAMETERS: readonly SharedBaseParameterSpec[] = [
  { id: "baseWidthRatio", symbol: "W_base/H", label: "Maximum lateral base width" },
  { id: "baseLengthRatio", symbol: "L_base/H", label: "Fore-aft base length" },
  { id: "baseHeightRatio", symbol: "H_base/H", label: "Base height" },
  { id: "baseLateralRadiusRatio", symbol: "R_lat/H", label: "Lateral curvature radius" },
  { id: "baseForeAftRadiusRatio", symbol: "R_fore/H", label: "Fore-aft curvature radius" },
  { id: "baseEdgeRoundingRatio", symbol: "r_edge/H", label: "Edge-rounding radius" },
  { id: "baseFrontBackAsymmetry", symbol: "f_fb", label: "Front/back asymmetry" },
  { id: "baseLeftRightAsymmetry", symbol: "f_lr", label: "Left/right asymmetry" },
  { id: "baseOffsetXRatio", symbol: "x_base/H", label: "Base x-offset vs upper body" },
  { id: "baseForwardLeanDeg", symbol: "theta_base", label: "Intrinsic base forward lean" },
  { id: "baseMassFraction", symbol: "m_base/M", label: "Base mass fraction" }
];

/**
 * The shared schema resolved from normalized ratios into meters and radians for
 * one particular statue, so family code never re-derives `x * H` and cannot
 * disagree about what a ratio meant.
 */
export interface ResolvedBaseParams {
  heightM: number;
  widthY: number;
  lengthX: number;
  heightZ: number;
  lateralRadius: number;
  foreAftRadius: number;
  edgeRounding: number;
  frontBackAsymmetry: number;
  leftRightAsymmetry: number;
  offsetX: number;
  mountLeanRad: number;
  massKg: number;
}

export function resolveSharedBaseParams(params: StatueParams): ResolvedBaseParams {
  const H = params.heightM;
  return {
    heightM: H,
    widthY: params.baseWidthRatio * H,
    lengthX: params.baseLengthRatio * H,
    heightZ: params.baseHeightRatio * H,
    lateralRadius: params.baseLateralRadiusRatio * H,
    foreAftRadius: params.baseForeAftRadiusRatio * H,
    edgeRounding: params.baseEdgeRoundingRatio * H,
    frontBackAsymmetry: params.baseFrontBackAsymmetry,
    leftRightAsymmetry: params.baseLeftRightAsymmetry,
    offsetX: params.baseOffsetXRatio * H,
    mountLeanRad: (params.baseForwardLeanDeg * Math.PI) / 180,
    massKg: params.baseMassFraction * params.totalMassKg
  };
}

/** Ranges the UI sliders enforce and the validators re-check, kept in one
 * place so a control and its validator cannot disagree. */
export const SHARED_BASE_PARAM_RANGES: Record<SharedBaseParameterId, { min: number; max: number }> = {
  baseWidthRatio: { min: 0.12, max: 0.6 },
  baseLengthRatio: { min: 0.1, max: 0.5 },
  baseHeightRatio: { min: 0.06, max: 0.35 },
  baseLateralRadiusRatio: { min: 0.06, max: 0.6 },
  baseForeAftRadiusRatio: { min: 0.02, max: 0.6 },
  baseEdgeRoundingRatio: { min: 0, max: 0.12 },
  baseFrontBackAsymmetry: { min: -0.8, max: 0.8 },
  baseLeftRightAsymmetry: { min: -0.5, max: 0.5 },
  baseOffsetXRatio: { min: -0.15, max: 0.15 },
  baseForwardLeanDeg: { min: -15, max: 30 },
  baseMassFraction: { min: 0.05, max: 0.75 }
};

/**
 * Validates the shared schema for a family, given which parameters that family
 * actually reads.
 *
 * Only relevant parameters are range-checked. Rejecting a family because an
 * out-of-range value sat in a control it ignores would be a false failure, and
 * would make it impossible to carry one parameter set across families — which
 * is exactly what the schema exists to allow.
 */
export function validateSharedBaseParams(
  params: StatueParams,
  used: readonly SharedBaseParameterId[]
): void {
  for (const id of used) {
    const range = SHARED_BASE_PARAM_RANGES[id];
    const value = params[id];
    if (!Number.isFinite(value)) {
      throw new Error(`Base parameter "${id}" must be a finite number; got ${value}.`);
    }
    if (value < range.min || value > range.max) {
      throw new Error(
        `Base parameter "${id}" = ${value} is outside the supported range ` +
          `[${range.min}, ${range.max}] for base family "${params.baseFamily}".`
      );
    }
  }
}
