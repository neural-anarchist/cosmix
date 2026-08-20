import type { Vec3 } from "../core/vec3";
import { getBaseModule } from "../statue/bases/registry";
import { SHARED_BASE_PARAM_RANGES, type SharedBaseParameterId } from "../statue/bases/shared";
import { bodyContainsPoint } from "../statue/envelope";
import { computeStatueGeometry } from "../statue/geometry";
import type { StatueParams } from "../statue/types";
import { solveBallast } from "./ballast";
import { solveMonotonic } from "./solve";
import { LOCK_TOLERANCES, type LockReport, type MatchedComparisonConfig, type MatchedResolution } from "./types";

/**
 * Turns a raw family configuration plus a set of locks into the statue that
 * should actually be built, and a full account of what was and was not achieved.
 *
 * Entirely headless and pure: no Rapier, no Three.js, no store. That is what
 * lets every normalization claim be unit-tested directly, which matters more
 * here than anywhere else in the project — the whole value of a matched
 * comparison rests on the matching actually being exact.
 *
 * The order below is not arbitrary. Geometry is normalized first because mass
 * and COM are consequences of it; the mass/COM stage then runs as a short fixed
 * point, because locking base mass changes the centre of mass, which changes
 * how much ballast is needed, which changes the mass the geometry is allowed to
 * carry.
 */
export function resolveMatchedComparison(options: {
  rawParams: StatueParams;
  config: MatchedComparisonConfig;
  presetId: string;
  comparisonGroupId: string;
}): MatchedResolution {
  const { rawParams, config, presetId, comparisonGroupId } = options;

  if (!config.enabled) {
    return {
      status: "RAW",
      presetId,
      comparisonGroupId,
      statueParams: rawParams,
      reports: [],
      problems: [],
      abstract: rawParams.comOverrideEnabled,
      abstractNote: rawParams.comOverrideEnabled
        ? "Abstract COM override is active. This statue's mass distribution corresponds to no real arrangement of its own geometry."
        : null
    };
  }

  const problems: string[] = [];
  const reports: LockReport[] = [];
  const family = rawParams.baseFamily;
  const module = getBaseModule(family);
  const reads = (id: SharedBaseParameterId) => module.usesParameters.includes(id);

  // Matched mode never inherits the abstract COM override silently: it exists
  // for raw-geometry sweeps where COM is the independent variable, and carrying
  // it into a controlled comparison would mean normalising against a body that
  // is already a probe.
  let params: StatueParams = { ...rawParams, ballast: null, comOverrideEnabled: false };
  const overrideWasDropped = rawParams.comOverrideEnabled;

  // ---- 1. Total height. Every other normalized ratio is relative to it, so it
  // must be settled before anything that divides by H.
  if (config.lockTotalHeight) {
    params = { ...params, heightM: config.targetTotalHeight };
  }
  const H = params.heightM;

  // ---- 2. Plan dimensions. Every family guarantees widthY = W_base/H x H and
  // lengthX = L_base/H x H exactly (asserted family-by-family in Step 2), so
  // these are direct assignments rather than solves.
  if (config.lockMaximumLateralWidth) {
    const ratio = config.targetMaximumLateralWidth / H;
    const range = SHARED_BASE_PARAM_RANGES.baseWidthRatio;
    if (ratio < range.min || ratio > range.max) {
      problems.push(
        `Maximum lateral width ${config.targetMaximumLateralWidth.toFixed(3)} m needs W_base/H = ` +
          `${ratio.toFixed(3)}, outside the supported range [${range.min}, ${range.max}] at a statue height of ${H.toFixed(2)} m.`
      );
    } else {
      params = { ...params, baseWidthRatio: ratio };
    }
  }

  if (config.lockForeAftLength) {
    const ratio = config.targetForeAftLength / H;
    const range = SHARED_BASE_PARAM_RANGES.baseLengthRatio;
    if (ratio < range.min || ratio > range.max) {
      problems.push(
        `Fore-aft length ${config.targetForeAftLength.toFixed(3)} m needs L_base/H = ${ratio.toFixed(3)}, ` +
          `outside the supported range [${range.min}, ${range.max}] at a statue height of ${H.toFixed(2)} m.`
      );
    } else {
      params = { ...params, baseLengthRatio: ratio };
    }
  }

  // ---- 3. Base height. Direct for a flat family, which reads H_base/H. A
  // rocker does not: its height falls out of its width and curvature, so the
  // only way to reach a target is to solve on whichever curvature parameter it
  // does read — and for some rockers no solution exists at all.
  let baseHeightMethod = "not locked";
  if (config.lockBaseHeight) {
    if (reads("baseHeightRatio")) {
      const ratio = config.targetBaseHeight / H;
      const range = SHARED_BASE_PARAM_RANGES.baseHeightRatio;
      if (ratio < range.min || ratio > range.max) {
        problems.push(
          `Base height ${config.targetBaseHeight.toFixed(3)} m needs H_base/H = ${ratio.toFixed(3)}, outside ` +
            `the supported range [${range.min}, ${range.max}].`
        );
      } else {
        params = { ...params, baseHeightRatio: ratio };
        baseHeightMethod = "direct: H_base/H set to target / H";
      }
    } else {
      const curvature: SharedBaseParameterId | null = reads("baseLateralRadiusRatio")
        ? "baseLateralRadiusRatio"
        : reads("baseForeAftRadiusRatio")
          ? "baseForeAftRadiusRatio"
          : null;

      if (!curvature) {
        problems.push(
          `${family}'s base height is fixed entirely by its width — a cylindrical rocker is as tall as it ` +
            "is wide — so it cannot be matched independently. Use a preset that does not lock base height, " +
            "or compare flat-bottomed families."
        );
        baseHeightMethod = "impossible for this family";
      } else {
        const attempt = { ...params };
        const solved = solveMonotonic(
          (value) => getBaseModule(family).dims({ ...attempt, [curvature]: value }).topZ,
          config.targetBaseHeight,
          SHARED_BASE_PARAM_RANGES[curvature],
          LOCK_TOLERANCES.lengthM * 1e-4
        );
        if (solved.converged) {
          params = { ...params, [curvature]: solved.value };
          baseHeightMethod = `numeric solve on ${curvature}`;
        } else {
          problems.push(
            `${family}'s base height cannot reach ${config.targetBaseHeight.toFixed(3)} m by varying ` +
              `${curvature} within its supported range` +
              (solved.outOfRange
                ? ` — that range produces ${solved.outOfRange.min.toFixed(3)} m to ${solved.outOfRange.max.toFixed(3)} m.`
                : ".") +
              " Its height is a consequence of its width and curvature, which are already constrained."
          );
          baseHeightMethod = "no solution in range";
        }
      }
    }
  }

  // ---- 4. Base volume, solved on whichever plan dimension is still free.
  let baseVolumeMethod = "not locked";
  if (config.lockBaseVolume && config.targetBaseVolume !== undefined) {
    const free: SharedBaseParameterId | null = !config.lockForeAftLength
      ? "baseLengthRatio"
      : !config.lockBaseHeight && reads("baseHeightRatio")
        ? "baseHeightRatio"
        : null;

    if (!free) {
      problems.push(
        "Base volume is locked but every dimension that could absorb it — fore-aft length and base " +
          "height — is locked too. Volume is then a consequence, not a constraint."
      );
      baseVolumeMethod = "over-constrained";
    } else {
      const attempt = { ...params };
      const solved = solveMonotonic(
        (value) => getBaseModule(family).dims({ ...attempt, [free]: value }).volumeM3,
        config.targetBaseVolume,
        SHARED_BASE_PARAM_RANGES[free],
        config.targetBaseVolume * LOCK_TOLERANCES.volumeRelative * 1e-4
      );
      if (solved.converged) {
        params = { ...params, [free]: solved.value };
        baseVolumeMethod = `numeric solve on ${free}`;
      } else {
        problems.push(
          `${family} cannot reach a base volume of ${config.targetBaseVolume.toFixed(4)} m³ by varying ` +
            `${free} within its supported range` +
            (solved.outOfRange
              ? ` — that range produces ${solved.outOfRange.min.toFixed(4)} to ${solved.outOfRange.max.toFixed(4)} m³.`
              : ".")
        );
        baseVolumeMethod = "no solution in range";
      }
    }
  }

  // ---- 5. Mass and centre of mass.
  //
  // Run as a fixed point rather than a single pass: locking base mass changes
  // the mass fractions, which moves the geometry's centre of mass, which changes
  // how much ballast the COM lock needs, which changes the mass the geometry is
  // allowed to carry — and so on. The coupling is weak, so a handful of passes
  // converge to well inside tolerance; the achieved values are measured
  // afterwards regardless, so a failure to converge shows up as a violated lock
  // rather than as a silent approximation.
  let massMethod = "not locked";
  let comMethod = "not locked";
  let ballastFraction = 0;

  if (config.lockTotalMass) {
    params = { ...params, totalMassKg: config.targetTotalMass };
    massMethod = "direct: total mass set to target";
  }

  for (let pass = 0; pass < 12; pass++) {
    const totalTarget = config.lockTotalMass ? config.targetTotalMass : params.totalMassKg;

    if (config.lockBaseMass && config.targetBaseMass !== undefined) {
      const geometryMass = totalTarget * (1 - ballastFraction);
      const fraction = config.targetBaseMass / geometryMass;
      const range = SHARED_BASE_PARAM_RANGES.baseMassFraction;
      if (fraction < range.min || fraction > range.max) {
        if (pass === 0) {
          problems.push(
            `Base mass ${config.targetBaseMass.toFixed(1)} kg is ${(fraction * 100).toFixed(1)}% of this ` +
              `statue's ${geometryMass.toFixed(1)} kg of geometry, outside the supported ` +
              `[${range.min * 100}%, ${range.max * 100}%].`
          );
        }
        break;
      }
      params = { ...params, baseMassFraction: fraction };
    }

    if (!config.lockTotalCOM) break;

    const unballasted: StatueParams = { ...params, ballast: null };
    const geometry = computeStatueGeometry(unballasted);
    const solution = solveBallast({
      targetTotalMassKg: totalTarget,
      targetComLocal: config.targetCOM,
      geometryComLocal: geometry.comLocalAnalytic,
      containsPoint: (point) => bodyContainsPoint(unballasted, geometry, point),
      envelope: geometry.envelope,
      comToleranceM: LOCK_TOLERANCES.comM / 10
    });

    if (!solution.ok) {
      if (pass === 0) problems.push(solution.reason);
      break;
    }

    params = { ...params, totalMassKg: solution.geometryMassKg, ballast: solution.ballast };
    comMethod = solution.ballast
      ? `internal ballast: ${solution.ballast.massKg.toFixed(1)} kg at ` +
        `(${solution.ballast.localPosition.x.toFixed(3)}, ${solution.ballast.localPosition.y.toFixed(3)}, ` +
        `${solution.ballast.localPosition.z.toFixed(3)}) m body-local`
      : "no ballast needed — geometry already at target";
    massMethod = config.lockTotalMass
      ? solution.ballast
        ? "geometry mass reduced so geometry + ballast equals the target"
        : "direct: total mass set to target"
      : massMethod;

    if (Math.abs(solution.massFraction - ballastFraction) < 1e-12) break;
    ballastFraction = solution.massFraction;
  }

  // ---- 6. Principal inertia, if locked, is an abstract probe by construction.
  let abstract = false;
  let abstractNote: string | null = null;
  if (config.lockPrincipalInertia) {
    abstract = true;
    abstractNote =
      "Abstract mass-normalized comparison: COM is constrained independently of the collider-derived " +
      "inertia. Matching mass, COM and principal inertia across unlike shapes requires an internal mass " +
      "distribution that no real arrangement of this statue's material would produce.";
    if (!config.targetPrincipalInertia) {
      problems.push("Principal inertia is locked but no target inertia was supplied.");
    }
  }

  // ---- Measure what was actually achieved, from the resolved parameters.
  let achieved: ReturnType<typeof computeStatueGeometry> | null = null;
  try {
    achieved = computeStatueGeometry(params);
  } catch (error) {
    problems.push(`The normalized configuration is not buildable: ${(error as Error).message}`);
  }

  if (achieved) {
    reports.push(
      lengthLock("totalHeight", "Total height", config.lockTotalHeight, config.targetTotalHeight, achieved.heightM, "direct: height set to target"),
      lengthLock("maximumLateralWidth", "Maximum lateral width", config.lockMaximumLateralWidth, config.targetMaximumLateralWidth, achieved.base.widthY, "direct: W_base/H set to target / H"),
      lengthLock("foreAftLength", "Fore-aft length", config.lockForeAftLength, config.targetForeAftLength, achieved.base.lengthX, "direct: L_base/H set to target / H"),
      lengthLock("baseHeight", "Base height", config.lockBaseHeight, config.targetBaseHeight, achieved.base.topZ, baseHeightMethod),
      relativeLock("totalMass", "Total mass", "kg", config.lockTotalMass, config.targetTotalMass, achieved.totalMassWithBallastKg, LOCK_TOLERANCES.massRelative, massMethod),
      relativeLock("baseMass", "Base mass", "kg", config.lockBaseMass, config.targetBaseMass ?? null, achieved.base.massKg, LOCK_TOLERANCES.massRelative, config.lockBaseMass ? "base mass fraction set from target" : "not locked"),
      relativeLock("baseVolume", "Base volume", "m³", config.lockBaseVolume, config.targetBaseVolume ?? null, achieved.base.volumeM3, LOCK_TOLERANCES.volumeRelative, baseVolumeMethod)
    );

    for (const axis of ["x", "y", "z"] as const) {
      reports.push(
        lengthLock(
          "totalCOM",
          `COM ${axis}`,
          config.lockTotalCOM,
          config.targetCOM[axis],
          achieved.comLocalTotalAnalytic[axis],
          comMethod
        )
      );
    }
  }

  if (overrideWasDropped) {
    reports.push({
      id: "totalCOM",
      label: "Abstract COM override",
      unit: "",
      target: null,
      achieved: null,
      absoluteError: null,
      relativeError: null,
      tolerance: null,
      status: "NOT_APPLICABLE",
      method: "disabled by matched comparison",
      warning:
        "The abstract COM override was switched off on entry to matched mode. Normalising against a body " +
        "whose mass distribution is already a probe would make the comparison meaningless."
    });
  }

  const violated = reports.filter((r) => r.status === "VIOLATED");
  for (const report of violated) {
    problems.push(
      `${report.label} could not be matched: asked for ${report.target}, got ${report.achieved}.`
    );
  }

  return {
    status: problems.length > 0 ? "MATCHED_INVALID" : "MATCHED_OK",
    presetId,
    comparisonGroupId,
    statueParams: params,
    reports,
    problems,
    abstract,
    abstractNote
  };
}

function lengthLock(
  id: LockReport["id"],
  label: string,
  locked: boolean,
  target: number | null,
  achieved: number,
  method: string
): LockReport {
  if (!locked || target === null) {
    return {
      id, label, unit: "m", target: null, achieved,
      absoluteError: null, relativeError: null, tolerance: null,
      status: "UNLOCKED", method: "free — follows the family's own geometry"
    };
  }
  const absoluteError = achieved - target;
  return {
    id, label, unit: "m", target, achieved,
    absoluteError,
    relativeError: target !== 0 ? absoluteError / target : null,
    tolerance: LOCK_TOLERANCES.lengthM,
    status: Math.abs(absoluteError) <= LOCK_TOLERANCES.lengthM ? "MET" : "VIOLATED",
    method
  };
}

function relativeLock(
  id: LockReport["id"],
  label: string,
  unit: string,
  locked: boolean,
  target: number | null,
  achieved: number,
  tolerance: number,
  method: string
): LockReport {
  if (!locked || target === null) {
    return {
      id, label, unit, target: null, achieved,
      absoluteError: null, relativeError: null, tolerance: null,
      status: "UNLOCKED", method: "free — follows the family's own geometry"
    };
  }
  const absoluteError = achieved - target;
  const relativeError = target !== 0 ? absoluteError / target : null;
  return {
    id, label, unit, target, achieved,
    absoluteError,
    relativeError,
    tolerance,
    status: relativeError !== null && Math.abs(relativeError) <= tolerance ? "MET" : "VIOLATED",
    method
  };
}

/** Captures the targets a baseline family defines, which is what turns a preset
 * from a statement of intent into a concrete constraint set. */
export function captureTargets(params: StatueParams): {
  totalHeight: number;
  totalMass: number;
  com: Vec3;
  principalInertia: Vec3;
  maximumLateralWidth: number;
  foreAftLength: number;
  baseHeight: number;
  baseMass: number;
  baseVolume: number;
} {
  const geometry = computeStatueGeometry(params);
  return {
    totalHeight: geometry.heightM,
    totalMass: geometry.totalMassWithBallastKg,
    com: geometry.comLocalTotalAnalytic,
    // Inertia is not derivable without Rapier; the store fills this from the
    // live body when a baseline is captured from the running simulation.
    principalInertia: { x: 0, y: 0, z: 0 },
    maximumLateralWidth: geometry.base.widthY,
    foreAftLength: geometry.base.lengthX,
    baseHeight: geometry.base.topZ,
    baseMass: geometry.base.massKg,
    baseVolume: geometry.base.volumeM3
  };
}
