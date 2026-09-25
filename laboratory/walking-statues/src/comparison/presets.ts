import type { Vec3 } from "../core/vec3";
import type { MatchedComparisonConfig } from "./types";

export type ComparisonPresetId =
  | "rawGeometry"
  | "matchedEnvelope"
  | "matchedMassCom"
  | "matchedMassComWidth"
  | "matchedVolumeWidth"
  | "matchedMoaiTrial";

export interface ComparisonPreset {
  id: ComparisonPresetId;
  label: string;
  /** What this preset is for, in one sentence, shown beside the selector. */
  summary: string;
  /** What it deliberately leaves free, so the reader knows what may still differ. */
  leavesFree: string;
}

export const COMPARISON_PRESETS: readonly ComparisonPreset[] = [
  {
    id: "rawGeometry",
    label: "No matching (raw shapes)",
    summary:
      "No quantities are held equal. Each shape carries the mass, center of mass and inertia its own volume and densities imply.",
    leavesFree: "Everything — not a controlled comparison."
  },
  {
    id: "matchedEnvelope",
    label: "Match: overall size",
    summary: "Holds the bounding dimensions and the whole environment fixed; lets mass and the center of mass follow the shape.",
    leavesFree: "Total mass, base mass, center of mass, rotational inertia."
  },
  {
    id: "matchedMassCom",
    label: "Match: mass & balance point",
    summary: "Holds total mass and center of mass fixed; lets each shape keep its own footprint dimensions.",
    leavesFree: "Maximum width, fore-aft length, base height, base volume, rotational inertia."
  },
  {
    id: "matchedMassComWidth",
    label: "Match: mass, balance point & width",
    summary: "Adds maximum lateral width to the mass and balance-point locks, so no shape gains lateral stability just by being wider.",
    leavesFree: "Fore-aft length, base height, base volume, rotational inertia."
  },
  {
    id: "matchedVolumeWidth",
    label: "Match: base material & width",
    summary: "Holds the base's material volume and its lateral width fixed, letting fore-aft length absorb the difference.",
    leavesFree: "Total mass, center of mass, fore-aft length, rotational inertia."
  },
  {
    id: "matchedMoaiTrial",
    label: "Match: strictest (shape only)",
    summary:
      "The strictest preset, meant for comparing shapes directly: mass, center of mass, both plan dimensions, the full environment and the starting pose are all held fixed, leaving shape as the only variable.",
    leavesFree: "Base height, base volume, rotational inertia — all consequences of the shape being compared."
  }
];

const ENVIRONMENT_LOCKS = {
  lockInitialPose: false,
  lockRoad: true,
  lockRopeAnchors: true,
  lockRopeAttachments: true,
  lockMaxTension: true,
  lockProtocol: true,
  lockSolver: true
};

const NO_LOCKS = {
  lockTotalHeight: false,
  lockTotalMass: false,
  lockTotalCOM: false,
  lockPrincipalInertia: false,
  lockMaximumLateralWidth: false,
  lockForeAftLength: false,
  lockBaseHeight: false,
  lockBaseMass: false,
  lockBaseVolume: false,
  lockInitialPose: false,
  lockRoad: false,
  lockRopeAnchors: false,
  lockRopeAttachments: false,
  lockMaxTension: false,
  lockProtocol: false,
  lockSolver: false
};

/**
 * Which locks each preset turns on. Targets are supplied separately, by
 * capturing them from a baseline family — a preset says *what* is held equal,
 * never *to what value*, so the baseline is always an explicit choice rather
 * than a hidden default.
 *
 * No preset enables every lock. Several combinations are mutually incompatible
 * — a rocker's base height is fixed by its own width and curvature, so locking
 * width and base height together over-constrains it — and a preset that was
 * invalid for half the families by construction would be worse than useless.
 */
export function presetLocks(id: ComparisonPresetId): Omit<MatchedComparisonConfig, "enabled" | "targetTotalHeight" | "targetTotalMass" | "targetCOM" | "targetPrincipalInertia" | "targetMaximumLateralWidth" | "targetForeAftLength" | "targetBaseHeight" | "targetBaseMass" | "targetBaseVolume"> {
  switch (id) {
    case "rawGeometry":
      return { ...NO_LOCKS };

    case "matchedEnvelope":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockMaximumLateralWidth: true,
        lockForeAftLength: true,
        lockBaseHeight: true
      };

    case "matchedMassCom":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true
      };

    case "matchedMassComWidth":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true,
        lockMaximumLateralWidth: true
      };

    case "matchedVolumeWidth":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockTotalHeight: true,
        lockBaseVolume: true,
        lockMaximumLateralWidth: true
      };

    case "matchedMoaiTrial":
      return {
        ...NO_LOCKS,
        ...ENVIRONMENT_LOCKS,
        lockInitialPose: true,
        lockTotalHeight: true,
        lockTotalMass: true,
        lockTotalCOM: true,
        lockMaximumLateralWidth: true,
        lockForeAftLength: true
      };
  }
}

/** Targets captured from a baseline statue, which is what makes a preset concrete. */
export interface ComparisonTargets {
  totalHeight: number;
  totalMass: number;
  com: Vec3;
  principalInertia: Vec3;
  maximumLateralWidth: number;
  foreAftLength: number;
  baseHeight: number;
  baseMass: number;
  baseVolume: number;
}

export function buildConfig(
  id: ComparisonPresetId,
  targets: ComparisonTargets
): MatchedComparisonConfig {
  return {
    enabled: id !== "rawGeometry",
    ...presetLocks(id),
    targetTotalHeight: targets.totalHeight,
    targetTotalMass: targets.totalMass,
    targetCOM: targets.com,
    targetPrincipalInertia: targets.principalInertia,
    targetMaximumLateralWidth: targets.maximumLateralWidth,
    targetForeAftLength: targets.foreAftLength,
    targetBaseHeight: targets.baseHeight,
    targetBaseMass: targets.baseMass,
    targetBaseVolume: targets.baseVolume
  };
}
