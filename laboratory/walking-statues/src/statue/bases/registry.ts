import type { BaseFamilyId } from "../types";
import { a0FlatRect } from "./a0-flatRect";
import { a4LateralRocker } from "./a4-lateralRocker";
import type { BaseGeometryModule } from "./types";

const IMPLEMENTED_BASES: Partial<Record<BaseFamilyId, BaseGeometryModule>> = {
  A0: a0FlatRect,
  A4: a4LateralRocker
};

/** All family ids the UI is allowed to offer, in display order. Ids without
 * an implementation are listed as disabled options rather than omitted, so
 * the full roadmap stays visible in the UI. */
export const ALL_BASE_FAMILY_IDS: BaseFamilyId[] = ["A0", "A4", "A5", "B0", "B2", "B6"];

export function getBaseModule(id: BaseFamilyId): BaseGeometryModule {
  const module = IMPLEMENTED_BASES[id];
  if (!module) {
    throw new Error(
      `Base family "${id}" is not implemented yet (Phase 1 ships A0 and A4 only; ` +
        "see PLAN.md for the rest of the roadmap)."
    );
  }
  return module;
}

export function isBaseFamilyImplemented(id: BaseFamilyId): boolean {
  return id in IMPLEMENTED_BASES;
}
