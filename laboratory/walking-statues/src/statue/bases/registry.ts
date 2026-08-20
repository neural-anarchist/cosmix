import type { BaseFamilyId, StatueParams } from "../types";
import { a0FlatRect } from "./a0-flatRect";
import { a4LateralRocker } from "./a4-lateralRocker";
import {
  a1RoundedRect,
  a2Elliptical,
  a3Stadium,
  b0DBase,
  b2ForwardTeardrop,
  b3RearTeardrop,
  b4OffsetDBase,
  b6MoaiDBase
} from "./flatFamilies";
import { a5EllipsoidalRocker, b5AsymmetricRocker } from "./rockerFamilies";
import type { BaseGeometryModule } from "./types";

const IMPLEMENTED_BASES: Record<BaseFamilyId, BaseGeometryModule> = {
  A0: a0FlatRect,
  A1: a1RoundedRect,
  A2: a2Elliptical,
  A3: a3Stadium,
  A4: a4LateralRocker,
  A5: a5EllipsoidalRocker,
  B0: b0DBase,
  B2: b2ForwardTeardrop,
  B3: b3RearTeardrop,
  B4: b4OffsetDBase,
  B5: b5AsymmetricRocker,
  B6: b6MoaiDBase
};

/**
 * Every family the UI offers, in display order: the symmetric A-series first
 * as validation and reference shapes, then the fore-aft asymmetric B-series
 * that Phase 2 exists to test.
 *
 * The two series are separated in the UI as well, because the distinction is
 * scientific rather than cosmetic — an A-family on a flat symmetric road under
 * symmetric forcing has no mechanism by which to prefer a direction, and is a
 * validation model rather than a walking candidate.
 */
export const ALL_BASE_FAMILY_IDS: BaseFamilyId[] = [
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B0",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6"
];

/** Families with no fore-aft asymmetry available to them. Listed explicitly
 * rather than inferred from the id prefix so that adding a family forces the
 * question to be answered deliberately. */
export const SYMMETRIC_BASE_FAMILY_IDS: readonly BaseFamilyId[] = ["A0", "A1", "A2", "A3", "A4", "A5"];

export function getBaseModule(id: BaseFamilyId): BaseGeometryModule {
  const module = IMPLEMENTED_BASES[id];
  if (!module) {
    throw new Error(`Base family "${id}" has no implementation registered.`);
  }
  return module;
}

export function isBaseFamilyImplemented(id: BaseFamilyId): boolean {
  return id in IMPLEMENTED_BASES;
}

export function allBaseModules(): BaseGeometryModule[] {
  return ALL_BASE_FAMILY_IDS.map(getBaseModule);
}

/**
 * The fore-aft mirror of a family, or null when no exact mirror is available.
 *
 * B2 and B3 are the deliberate mirrored pair. Every symmetric family is its own
 * reflection. B5 mirrors within itself by negating its front/back asymmetry,
 * because its fore-aft profile is built symmetrically from that one number.
 *
 * B0, B4 and B6 have no exact mirror in this phase: a D-shape's rounded nose
 * and flat transom are intrinsic to the outline, so no setting of the shared
 * parameters reflects it — negating the asymmetry merely makes the nose shorter
 * while leaving it at the front. Returning null here rather than something
 * mirror-shaped is the point: a mirrored control that is not actually a mirror
 * would silently invalidate the trial it was run to validate.
 */
export function foreAftMirrorFamily(id: BaseFamilyId): BaseFamilyId | null {
  if (SYMMETRIC_BASE_FAMILY_IDS.includes(id)) return id;
  switch (id) {
    case "B2":
      return "B3";
    case "B3":
      return "B2";
    case "B5":
      // Mirrors onto itself, with its front/back asymmetry negated.
      return "B5";
    default:
      return null;
  }
}

export function hasExactForeAftMirror(id: BaseFamilyId): boolean {
  return foreAftMirrorFamily(id) !== null;
}

/**
 * Mirrors a parameter set fore-aft, or returns null when this family has no
 * exact mirror (see `foreAftMirrorFamily`).
 *
 * This is the transform a fore-aft mirrored control trial needs: any claimed
 * forward advance must reverse sign under it. One that does not is coming from
 * something other than the geometry's fore-aft asymmetry — solver bias, or a
 * bug — and Phase 2's completion criteria require the check.
 *
 * Note what is *not* negated for the B2/B3 pair: the front/back asymmetry stays
 * as it is, because B3 is generated as B2's reflection at the same parameter
 * values. Negating it as well would reflect the shape twice and hand back the
 * original.
 */
export function foreAftMirrorParams(params: StatueParams): StatueParams | null {
  const family = foreAftMirrorFamily(params.baseFamily);
  if (!family) return null;

  const mirrorsViaAsymmetry = family === params.baseFamily && params.baseFamily === "B5";

  return {
    ...params,
    baseFamily: family,
    baseFrontBackAsymmetry: mirrorsViaAsymmetry
      ? -params.baseFrontBackAsymmetry
      : params.baseFrontBackAsymmetry,
    // These sit outside the base outline and always reflect.
    baseOffsetXRatio: -params.baseOffsetXRatio,
    baseForwardLeanDeg: -params.baseForwardLeanDeg,
    forwardLeanDeg: -params.forwardLeanDeg,
    comOffsetXRatio: -params.comOffsetXRatio
  };
}

/**
 * Mirrors a parameter set left-to-right. Exact for every family, because every
 * footprint is constructed symmetric about y = 0 and then skewed by a single
 * signed asymmetry, so negating that one number reflects the shape exactly.
 *
 * This is the geometric counterpart to the rope-side reversal that Phase 1's
 * mirror-symmetry regression already exercises.
 */
export function lateralMirrorParams(params: StatueParams): StatueParams {
  return {
    ...params,
    baseLeftRightAsymmetry: -params.baseLeftRightAsymmetry,
    comOffsetYRatio: -params.comOffsetYRatio
  };
}
