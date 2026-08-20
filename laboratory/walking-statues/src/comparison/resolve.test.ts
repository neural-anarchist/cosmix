import { beforeAll, describe, expect, it } from "vitest";
import { GRAVITY_M_S2 } from "../core/constants";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { ALL_BASE_FAMILY_IDS, getBaseModule } from "../statue/bases/registry";
import { createStatueBody } from "../statue/body";
import { PHASE1_BASELINE_STATUE_PARAMS } from "../statue/defaults";
import { bodyContainsPoint } from "../statue/envelope";
import { computeStatueGeometry } from "../statue/geometry";
import type { BaseFamilyId, StatueParams } from "../statue/types";
import { MAX_BALLAST_FRACTION } from "./ballast";
import { buildConfig, type ComparisonPresetId } from "./presets";
import { captureTargets, resolveMatchedComparison } from "./resolve";
import { LOCK_TOLERANCES, type LockReport } from "./types";

let RAPIER_MODULE: RapierModule;
beforeAll(async () => {
  RAPIER_MODULE = await getRapier();
}, 30_000);

const raw = (id: BaseFamilyId, overrides: Partial<StatueParams> = {}): StatueParams => ({
  ...PHASE1_BASELINE_STATUE_PARAMS,
  baseFamily: id,
  ...overrides
});

/** A0 at the validated Phase 1 configuration is the baseline everything is
 * matched against, which is what the workflow does too. */
const A0_TARGETS = captureTargets(raw("A0"));

function resolve(id: BaseFamilyId, preset: ComparisonPresetId, overrides: Partial<StatueParams> = {}) {
  return resolveMatchedComparison({
    rawParams: raw(id, overrides),
    config: buildConfig(preset, A0_TARGETS),
    presetId: preset,
    comparisonGroupId: "test-group"
  });
}

const report = (reports: LockReport[], label: string) => reports.find((r) => r.label === label)!;

/** Builds the resolved statue for real and reads mass properties back from
 * Rapier, so the claims are checked against the engine rather than against the
 * same analytic code that produced them. */
function measure(params: StatueParams) {
  const world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
  const body = createStatueBody(params, RAPIER_MODULE, world, 0.65, 0.05);
  const result = {
    massKg: body.mass.massKg,
    comLocal: { ...body.mass.comLocal },
    principalInertia: { ...body.mass.principalInertia },
    colliderCount: body.colliders.length,
    ballast: body.mass.ballast
  };
  world.free();
  return result;
}

describe("raw geometry mode changes nothing", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s is passed through untouched", (id) => {
    const resolution = resolve(id, "rawGeometry");
    expect(resolution.status).toBe("RAW");
    expect(resolution.statueParams).toEqual(raw(id));
    expect(resolution.statueParams.ballast).toBeNull();
    expect(resolution.reports).toEqual([]);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s keeps its own derived mass, COM and inertia in raw mode", (id) => {
    const direct = measure(raw(id));
    const viaRaw = measure(resolve(id, "rawGeometry").statueParams);
    expect(viaRaw.massKg).toBeCloseTo(direct.massKg, 6);
    expect(viaRaw.comLocal.x).toBeCloseTo(direct.comLocal.x, 9);
    expect(viaRaw.comLocal.z).toBeCloseTo(direct.comLocal.z, 9);
    expect(viaRaw.principalInertia.x).toBeCloseTo(direct.principalInertia.x, 6);
    expect(viaRaw.colliderCount).toBe(direct.colliderCount);
    expect(viaRaw.ballast).toBeNull();
  });

  it("disabling matched mode restores the family's raw configuration exactly", () => {
    // Round-trip through the strictest preset and back.
    const matched = resolve("B2", "matchedMoaiTrial");
    expect(matched.statueParams).not.toEqual(raw("B2"));
    const back = resolve("B2", "rawGeometry");
    expect(back.statueParams).toEqual(raw("B2"));
  });

  it("A0 and A4 defaults are untouched when matched mode is off", () => {
    for (const id of ["A0", "A4"] as const) {
      expect(resolve(id, "rawGeometry").statueParams).toEqual(raw(id));
    }
  });
});

describe("matched mode changes only what is locked", () => {
  it("leaves every unlocked statue parameter alone", () => {
    const before = raw("B0");
    const after = resolve("B0", "matchedMassCom").statueParams;
    // Matched Mass + COM locks height, mass and COM. Plan dimensions, taper,
    // lean, damping and tessellation are all explicitly left free.
    expect(after.baseWidthRatio).toBe(before.baseWidthRatio);
    expect(after.baseLengthRatio).toBe(before.baseLengthRatio);
    expect(after.baseHeightRatio).toBe(before.baseHeightRatio);
    expect(after.torsoTaper).toBe(before.torsoTaper);
    expect(after.torsoWidthRatio).toBe(before.torsoWidthRatio);
    expect(after.forwardLeanDeg).toBe(before.forwardLeanDeg);
    expect(after.visualDetail).toBe(before.visualDetail);
    expect(after.linearDampingSI).toBe(before.linearDampingSI);
    expect(after.angularDampingSI).toBe(before.angularDampingSI);
    expect(after.baseFamily).toBe(before.baseFamily);
  });

  it("never carries the abstract COM override into a matched comparison", () => {
    const resolution = resolveMatchedComparison({
      rawParams: raw("B0", { comOverrideEnabled: true, comHeightRatio: 0.3 }),
      config: buildConfig("matchedMassCom", A0_TARGETS),
      presetId: "matchedMassCom",
      comparisonGroupId: "g"
    });
    expect(resolution.statueParams.comOverrideEnabled).toBe(false);
    const note = resolution.reports.find((r) => r.label === "Abstract COM override")!;
    expect(note.status).toBe("NOT_APPLICABLE");
    expect(note.warning).toMatch(/switched off/);
  });

  it("matched mode on A0 against A0's own targets is a no-op that still validates", () => {
    // The baseline compared with itself is the sharpest test of the machinery:
    // every lock must be met with nothing adjusted at all.
    const resolution = resolve("A0", "matchedMoaiTrial");
    expect(resolution.status).toBe("MATCHED_OK");
    expect(resolution.statueParams.ballast).toBeNull();
    for (const r of resolution.reports.filter((x) => x.status !== "UNLOCKED")) {
      expect(r.status, `${r.label}`).toBe("MET");
    }
  });
});

describe("dimension locks", () => {
  const DIMENSION_PRESETS = ["matchedEnvelope", "matchedMoaiTrial"] as const;
  const FLAT_FAMILIES = ALL_BASE_FAMILY_IDS.filter(
    (id) => getBaseModule(id).dims(raw(id)).contactKind === "flat"
  );

  it.each(FLAT_FAMILIES)("%s reaches the width and length targets under Matched Moai Trial", (id) => {
    const resolution = resolve(id, "matchedMoaiTrial");
    const width = report(resolution.reports, "Maximum lateral width");
    const length = report(resolution.reports, "Fore-aft length");
    const height = report(resolution.reports, "Total height");
    expect(width.status).toBe("MET");
    expect(length.status).toBe("MET");
    expect(height.status).toBe("MET");
    expect(Math.abs(width.absoluteError!)).toBeLessThan(LOCK_TOLERANCES.lengthM);
    expect(Math.abs(length.absoluteError!)).toBeLessThan(LOCK_TOLERANCES.lengthM);
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s keeps W_base as maximum lateral width after normalization", (id) => {
    for (const preset of DIMENSION_PRESETS) {
      const resolution = resolve(id, preset);
      const geometry = computeStatueGeometry(resolution.statueParams);
      // The invariant the whole schema rests on must survive normalization.
      expect(geometry.base.widthY).toBeCloseTo(
        resolution.statueParams.baseWidthRatio * resolution.statueParams.heightM,
        9
      );
      expect(geometry.base.maxY - geometry.base.minY).toBeCloseTo(geometry.base.widthY, 9);
    }
  });

  it.each(ALL_BASE_FAMILY_IDS)("%s keeps L_base as total fore-aft length after normalization", (id) => {
    for (const preset of DIMENSION_PRESETS) {
      const geometry = computeStatueGeometry(resolve(id, preset).statueParams);
      expect(geometry.base.maxX - geometry.base.minX).toBeCloseTo(geometry.base.lengthX, 9);
    }
  });

  it("preserves a family's intended asymmetry through scaling", () => {
    const skewed = raw("B0", { baseFrontBackAsymmetry: 0.4, baseLeftRightAsymmetry: 0.2 });
    const resolution = resolveMatchedComparison({
      rawParams: skewed,
      config: buildConfig("matchedMoaiTrial", A0_TARGETS),
      presetId: "matchedMoaiTrial",
      comparisonGroupId: "g"
    });
    expect(resolution.statueParams.baseFrontBackAsymmetry).toBe(0.4);
    expect(resolution.statueParams.baseLeftRightAsymmetry).toBe(0.2);
    const geometry = computeStatueGeometry(resolution.statueParams);
    // Still skewed, and still exactly the locked total extents.
    expect(geometry.base.maxX).not.toBeCloseTo(-geometry.base.minX, 3);
    expect(geometry.base.lengthX).toBeCloseTo(A0_TARGETS.foreAftLength, 6);
    expect(geometry.base.widthY).toBeCloseTo(A0_TARGETS.maximumLateralWidth, 6);
  });

  it("re-runs the wedge decomposition on the normalized geometry", () => {
    const resolution = resolve("B2", "matchedMoaiTrial");
    const pieces = getBaseModule("B2").colliderPolytopes(resolution.statueParams)!;
    const whole = getBaseModule("B2").polytope(resolution.statueParams)!;
    const wholeVolume = getBaseModule("B2").dims(resolution.statueParams).volumeM3;
    const sum = pieces.reduce((acc, piece) => {
      const v = piece.vertices;
      let six = 0;
      for (let i = 0; i < piece.indices.length; i += 3) {
        const a = v[piece.indices[i]!]!, b = v[piece.indices[i + 1]!]!, c = v[piece.indices[i + 2]!]!;
        six += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
      }
      return acc + six / 6;
    }, 0);
    expect(whole).not.toBeNull();
    // No gaps and no overlap: the wedges still tile exactly the scaled solid.
    expect(sum).toBeCloseTo(wholeVolume, 9);
  });
});

describe("base volume lock", () => {
  it.each(ALL_BASE_FAMILY_IDS)("%s reaches the base-volume target under Matched Volume + Width", (id) => {
    const resolution = resolve(id, "matchedVolumeWidth");
    const volume = report(resolution.reports, "Base volume");
    if (resolution.status === "MATCHED_INVALID") {
      // Allowed, but only with an explanation.
      expect(resolution.problems.length).toBeGreaterThan(0);
      return;
    }
    expect(volume.status).toBe("MET");
    expect(Math.abs(volume.relativeError!)).toBeLessThan(LOCK_TOLERANCES.volumeRelative);
  });

  it("solves volume on fore-aft length, leaving width exactly at target", () => {
    const resolution = resolve("A2", "matchedVolumeWidth");
    expect(resolution.status).toBe("MATCHED_OK");
    expect(report(resolution.reports, "Base volume").method).toMatch(/numeric solve on baseLengthRatio/);
    expect(report(resolution.reports, "Maximum lateral width").status).toBe("MET");
    expect(resolution.statueParams.baseLengthRatio).not.toBe(PHASE1_BASELINE_STATUE_PARAMS.baseLengthRatio);
  });
});

describe("mass and COM locks", () => {
  const FAMILIES = ["A0", "A2", "B0", "B2", "B3", "B5", "B6"] as const;

  it.each(FAMILIES)("%s hits the total-mass target as Rapier measures it", (id) => {
    const resolution = resolve(id, "matchedMassComWidth");
    expect(resolution.status).toBe("MATCHED_OK");
    const measured = measure(resolution.statueParams);
    expect(Math.abs(measured.massKg - A0_TARGETS.totalMass) / A0_TARGETS.totalMass).toBeLessThan(
      LOCK_TOLERANCES.massRelative
    );
  });

  it.each(FAMILIES)("%s hits the COM target as Rapier measures it", (id) => {
    const resolution = resolve(id, "matchedMassComWidth");
    const measured = measure(resolution.statueParams);
    for (const axis of ["x", "y", "z"] as const) {
      expect(
        Math.abs(measured.comLocal[axis] - A0_TARGETS.com[axis]),
        `${id} COM ${axis}`
      ).toBeLessThan(LOCK_TOLERANCES.comM);
    }
  });

  it.each(FAMILIES)("%s produces ballast with positive mass, inside the statue's own material", (id) => {
    const resolution = resolve(id, "matchedMassComWidth");
    const ballast = resolution.statueParams.ballast;
    if (!ballast) return;
    const unballasted = { ...resolution.statueParams, ballast: null };
    const geometry = computeStatueGeometry(unballasted);
    expect(ballast.massKg).toBeGreaterThan(0);
    expect(ballast.massKg / A0_TARGETS.totalMass).toBeLessThanOrEqual(MAX_BALLAST_FRACTION);
    // Inside the base, torso or head — not merely inside the box around them.
    // The bounding box of a wide-based statue is mostly air at shoulder height.
    expect(bodyContainsPoint(unballasted, geometry, ballast.localPosition)).toBe(true);
  });

  it("rejects a ballast position that is inside the bounding box but outside the body", () => {
    // The regression for a real defect: with a box test, B0's ballast landed at
    // x = 0.373 m at shoulder height, where the torso is only 0.28 m half-deep —
    // 9 cm outside the statue, reported as internal.
    const params = raw("B0");
    const geometry = computeStatueGeometry(params);
    const airBesideTheTorso = { x: 0.373, y: 0, z: 1.648 };
    expect(airBesideTheTorso.x).toBeLessThan(geometry.envelope.max.x);
    expect(bodyContainsPoint(params, geometry, airBesideTheTorso)).toBe(false);
  });

  it.each(FAMILIES)("%s creates no invalid or negative density", (id) => {
    const resolution = resolve(id, "matchedMassComWidth");
    const params = resolution.statueParams;
    expect(params.totalMassKg).toBeGreaterThan(0);
    expect(params.baseMassFraction).toBeGreaterThan(0);
    expect(params.headMassFraction).toBeGreaterThan(0);
    expect(params.baseMassFraction + params.headMassFraction).toBeLessThan(1);
    const components = computeStatueGeometry(params);
    expect(components.base.massKg).toBeGreaterThan(0);
    expect(components.torso.massKg).toBeGreaterThan(0);
    expect(components.head.massKg).toBeGreaterThan(0);
  });

  it.each(FAMILIES)("%s reports a recomputed inertia tensor when inertia is not locked", (id) => {
    const measured = measure(resolve(id, "matchedMassComWidth").statueParams);
    for (const axis of ["x", "y", "z"] as const) {
      expect(Number.isFinite(measured.principalInertia[axis])).toBe(true);
      expect(measured.principalInertia[axis]).toBeGreaterThan(0);
    }
  });

  it("adds no ballast when the geometry already sits at the target", () => {
    expect(resolve("A0", "matchedMassCom").statueParams.ballast).toBeNull();
  });

  it("leaves contact geometry untouched when ballast is applied", () => {
    // Ballast is a mass, not a shape: it goes in through Rapier's additional
    // mass properties, so no collider may change.
    const resolution = resolve("B2", "matchedMassComWidth");
    expect(resolution.statueParams.ballast).not.toBeNull();
    const withBallast = measure(resolution.statueParams);
    const without = measure({ ...resolution.statueParams, ballast: null });
    expect(withBallast.colliderCount).toBe(without.colliderCount);
    const a = getBaseModule("B2").colliderPolytopes(resolution.statueParams)!;
    const b = getBaseModule("B2").colliderPolytopes({ ...resolution.statueParams, ballast: null })!;
    expect(a.map((p) => p.vertices)).toEqual(b.map((p) => p.vertices));
  });
});

describe("B2 and B3 keep their mirror-control integrity through normalization", () => {
  const PRESETS = ["matchedEnvelope", "matchedMassCom", "matchedMassComWidth", "matchedVolumeWidth", "matchedMoaiTrial"] as const;

  it.each(PRESETS)("under %s, B2 and B3 stay exact fore-aft mirrors", (preset) => {
    const b2 = resolve("B2", preset);
    const b3 = resolve("B3", preset);
    expect(b2.status).toBe(b3.status);

    // Every geometry-defining parameter must come out identical, because the
    // two families differ only by the reflection built into B3 itself.
    for (const key of [
      "heightM", "baseWidthRatio", "baseLengthRatio", "baseHeightRatio",
      "baseForeAftRadiusRatio", "baseFrontBackAsymmetry", "baseLeftRightAsymmetry",
      "totalMassKg", "baseMassFraction", "headMassFraction"
    ] as const) {
      expect(b3.statueParams[key], `${preset}: ${key}`).toBeCloseTo(b2.statueParams[key] as number, 12);
    }

    const g2 = computeStatueGeometry(b2.statueParams);
    const g3 = computeStatueGeometry(b3.statueParams);
    expect(g3.base.volumeM3).toBeCloseTo(g2.base.volumeM3, 9);
    expect(g3.base.comLocal.x).toBeCloseTo(-g2.base.comLocal.x, 9);
    expect(g3.base.minX).toBeCloseTo(-g2.base.maxX, 9);
    expect(g3.base.maxX).toBeCloseTo(-g2.base.minX, 9);
  });

  it.each(PRESETS)("under %s, B2 and B3 have equal total mass", (preset) => {
    const m2 = measure(resolve("B2", preset).statueParams);
    const m3 = measure(resolve("B3", preset).statueParams);
    expect(m3.massKg).toBeCloseTo(m2.massKg, 3);
  });

  it("has equal and opposite COM x before any global COM normalization", () => {
    const g2 = computeStatueGeometry(resolve("B2", "matchedEnvelope").statueParams);
    const g3 = computeStatueGeometry(resolve("B3", "matchedEnvelope").statueParams);
    expect(g3.comLocalTotalAnalytic.x).toBeCloseTo(-g2.comLocalTotalAnalytic.x, 9);
    expect(Math.abs(g2.comLocalTotalAnalytic.x)).toBeGreaterThan(1e-4);
  });

  it("places mirrored ballast when the COM target lies on the mirror plane", () => {
    // The documented and intended behaviour. A0's COM sits at x = 0, so pulling
    // both teardrops onto it moves them in opposite directions by equal amounts,
    // and the mirror survives ballast and all.
    expect(A0_TARGETS.com.x).toBeCloseTo(0, 9);
    const b2 = resolve("B2", "matchedMoaiTrial").statueParams.ballast!;
    const b3 = resolve("B3", "matchedMoaiTrial").statueParams.ballast!;
    expect(b2).not.toBeNull();
    expect(b3.massKg).toBeCloseTo(b2.massKg, 6);
    expect(b3.localPosition.x).toBeCloseTo(-b2.localPosition.x, 9);
    expect(b3.localPosition.y).toBeCloseTo(b2.localPosition.y, 9);
    expect(b3.localPosition.z).toBeCloseTo(b2.localPosition.z, 9);
  });

  it("breaks the mirror only when the COM target is itself off the mirror plane, and does so symmetrically", () => {
    // Stated rather than hidden: a target COM with x != 0 is not mirror-symmetric,
    // so the pair normalised onto it cannot be either. B3 matched against an
    // off-plane target is the mirror of B2 matched against the *reflected* target.
    const offPlane = { ...A0_TARGETS, com: { x: 0.05, y: 0, z: A0_TARGETS.com.z } };
    const reflected = { ...A0_TARGETS, com: { x: -0.05, y: 0, z: A0_TARGETS.com.z } };
    const b2 = resolveMatchedComparison({
      rawParams: raw("B2"), config: buildConfig("matchedMoaiTrial", offPlane),
      presetId: "p", comparisonGroupId: "g"
    }).statueParams.ballast!;
    const b3 = resolveMatchedComparison({
      rawParams: raw("B3"), config: buildConfig("matchedMoaiTrial", reflected),
      presetId: "p", comparisonGroupId: "g"
    }).statueParams.ballast!;
    expect(b3.localPosition.x).toBeCloseTo(-b2.localPosition.x, 9);
    expect(b3.massKg).toBeCloseTo(b2.massKg, 6);
  });

  it("keeps B2 and B3 inertially equivalent after normalization", () => {
    const m2 = measure(resolve("B2", "matchedMoaiTrial").statueParams);
    const m3 = measure(resolve("B3", "matchedMoaiTrial").statueParams);
    for (const axis of ["x", "y", "z"] as const) {
      expect(m3.principalInertia[axis]).toBeCloseTo(m2.principalInertia[axis], 1);
    }
  });

  it("introduces no non-mirrored collider difference", () => {
    const p2 = resolve("B2", "matchedMoaiTrial").statueParams;
    const p3 = resolve("B3", "matchedMoaiTrial").statueParams;
    const a = getBaseModule("B2").colliderPolytopes(p2)!;
    const b = getBaseModule("B3").colliderPolytopes(p3)!;
    expect(b).toHaveLength(a.length);
    const span = (pieces: typeof a) => ({
      minX: Math.min(...pieces.flatMap((p) => p.vertices.map((v) => v.x))),
      maxX: Math.max(...pieces.flatMap((p) => p.vertices.map((v) => v.x))),
      minY: Math.min(...pieces.flatMap((p) => p.vertices.map((v) => v.y))),
      maxY: Math.max(...pieces.flatMap((p) => p.vertices.map((v) => v.y)))
    });
    const sa = span(a);
    const sb = span(b);
    expect(sb.minX).toBeCloseTo(-sa.maxX, 9);
    expect(sb.maxX).toBeCloseTo(-sa.minX, 9);
    expect(sb.minY).toBeCloseTo(sa.minY, 9);
    expect(sb.maxY).toBeCloseTo(sa.maxY, 9);
  });
});

describe("invalid constraints are rejected, not approximated", () => {
  it("rejects a COM target that would need ballast outside the body", () => {
    const impossible = { ...A0_TARGETS, com: { x: 0, y: 0, z: 3.2 } };
    const resolution = resolveMatchedComparison({
      rawParams: raw("A0"), config: buildConfig("matchedMassCom", impossible),
      presetId: "matchedMassCom", comparisonGroupId: "g"
    });
    expect(resolution.status).toBe("MATCHED_INVALID");
    expect(resolution.problems.join(" ")).toMatch(/ballast|centre of mass/i);
    // Nothing else was quietly adjusted to make it fit.
    expect(resolution.statueParams.ballast).toBeNull();
    expect(resolution.statueParams.heightM).toBe(A0_TARGETS.totalHeight);
  });

  it("rejects a base-height lock on a cylindrical rocker, whose height is its width", () => {
    const resolution = resolve("A4", "matchedEnvelope");
    expect(resolution.status).toBe("MATCHED_INVALID");
    expect(resolution.problems.join(" ")).toMatch(/fixed entirely by its width/);
  });

  it("rejects a base-volume target no family dimension can reach", () => {
    const impossible = { ...A0_TARGETS, baseVolume: 25 };
    const resolution = resolveMatchedComparison({
      rawParams: raw("A2"), config: buildConfig("matchedVolumeWidth", impossible),
      presetId: "matchedVolumeWidth", comparisonGroupId: "g"
    });
    expect(resolution.status).toBe("MATCHED_INVALID");
    expect(resolution.problems.join(" ")).toMatch(/base volume/i);
  });

  it("rejects a width target outside what the schema supports at this height", () => {
    const impossible = { ...A0_TARGETS, maximumLateralWidth: 6 };
    const resolution = resolveMatchedComparison({
      rawParams: raw("B0"), config: buildConfig("matchedMassComWidth", impossible),
      presetId: "matchedMassComWidth", comparisonGroupId: "g"
    });
    expect(resolution.status).toBe("MATCHED_INVALID");
    expect(resolution.problems.join(" ")).toMatch(/Maximum lateral width/);
    // The unreachable lock did not disturb the reachable ones.
    expect(resolution.statueParams.heightM).toBe(A0_TARGETS.totalHeight);
    expect(resolution.statueParams.baseWidthRatio).toBe(PHASE1_BASELINE_STATUE_PARAMS.baseWidthRatio);
  });

  it("builds a valid, stable collider set even for a rejected configuration", () => {
    // An invalid scenario must not also be an unbuildable one, or the app would
    // fall over instead of explaining itself.
    const resolution = resolve("A4", "matchedEnvelope");
    expect(resolution.status).toBe("MATCHED_INVALID");
    const measured = measure(resolution.statueParams);
    expect(measured.massKg).toBeGreaterThan(0);
    expect(Number.isFinite(measured.comLocal.z)).toBe(true);
  });

  it("marks principal-inertia locking as an abstract probe", () => {
    const config = { ...buildConfig("matchedMoaiTrial", A0_TARGETS), lockPrincipalInertia: true };
    const resolution = resolveMatchedComparison({
      rawParams: raw("B0"), config, presetId: "custom", comparisonGroupId: "g"
    });
    expect(resolution.abstract).toBe(true);
    expect(resolution.abstractNote).toMatch(/Abstract mass-normalized comparison/);
  });
});

describe("the comparison group identifier travels with the resolution", () => {
  it("is carried through unchanged", () => {
    const resolution = resolveMatchedComparison({
      rawParams: raw("B2"), config: buildConfig("matchedMoaiTrial", A0_TARGETS),
      presetId: "matchedMoaiTrial", comparisonGroupId: "group-42"
    });
    expect(resolution.comparisonGroupId).toBe("group-42");
    expect(resolution.presetId).toBe("matchedMoaiTrial");
  });
});
