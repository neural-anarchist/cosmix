import { beforeAll, describe, expect, it } from "vitest";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { DEFAULT_ROAD_PARAMS } from "../state/store";
import { BenchmarkHarness } from "../benchmark/harness";
import { lateralRopeParams } from "../control/ropeDefaults";
import { DEFAULT_STATUE_PARAMS } from "./defaults";
import { computeStatueGeometry } from "./geometry";

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await getRapier();
}, 30_000);

describe("computeStatueGeometry", () => {
  it("partitions mass exactly across base, torso and head", () => {
    const g = computeStatueGeometry(DEFAULT_STATUE_PARAMS);
    expect(g.base.massKg + g.torso.massKg + g.head.massKg).toBeCloseTo(DEFAULT_STATUE_PARAMS.totalMassKg, 9);
  });

  it("stacks base, torso and head without gaps or overlap", () => {
    const g = computeStatueGeometry(DEFAULT_STATUE_PARAMS);
    expect(g.torso.bottomZ).toBeCloseTo(g.base.topZ, 12);
    // Head sits directly on the torso top, and the crown reaches exactly H.
    expect(g.head.centerZ - g.head.radius).toBeCloseTo(g.torso.topZ, 12);
    expect(g.head.centerZ + g.head.radius).toBeCloseTo(DEFAULT_STATUE_PARAMS.heightM, 12);
  });

  it("places the default rope attachment above the COM, giving a tipping moment arm", () => {
    const g = computeStatueGeometry(DEFAULT_STATUE_PARAMS);
    expect(g.defaultAttachment.left.z).toBeGreaterThan(g.comHeightAnalyticM);
    expect(g.defaultAttachment.left.y).toBeCloseTo(-g.defaultAttachment.right.y, 12);
    expect(g.defaultAttachment.left.y).toBeGreaterThan(0);
  });

  it("gives A0 a finite tipping lever arm and A4 none", () => {
    const a0 = computeStatueGeometry({ ...DEFAULT_STATUE_PARAMS, baseFamily: "A0" });
    const a4 = computeStatueGeometry({ ...DEFAULT_STATUE_PARAMS, baseFamily: "A4" });
    expect(a0.base.contactKind).toBe("flat");
    expect(a0.base.contactHalfWidthY).toBeCloseTo(a0.base.widthY / 2, 12);
    expect(a4.base.contactKind).toBe("rocker");
    expect(a4.base.contactHalfWidthY).toBe(0);
  });

  it("rejects mass fractions that leave the torso massless", () => {
    expect(() =>
      computeStatueGeometry({ ...DEFAULT_STATUE_PARAMS, baseMassFraction: 0.7, headMassFraction: 0.4 })
    ).toThrow(/torso has positive mass/);
  });

  it("rejects a base plus head taller than the statue", () => {
    // Unreachable through the UI sliders (baseHeightRatio caps at 0.35, and
    // 0.35 + HEAD_HEIGHT_RATIO < 1), so this guards programmatic callers only.
    expect(() =>
      computeStatueGeometry({ ...DEFAULT_STATUE_PARAMS, baseHeightRatio: 0.95 })
    ).toThrow(/exceed the total statue height/);
  });
});

describe("analytic geometry vs Rapier's own mass properties", () => {
  /**
   * The whole mass model rests on setting per-collider densities and letting
   * Rapier derive the aggregate. If the analytic COM and Rapier's disagree,
   * either the densities or the volumes are wrong, and every threshold
   * computed from geometry is wrong with them.
   */
  it.each(["A0", "A4"] as const)("agrees on total mass and COM height for %s", (baseFamily) => {
    const params = { ...DEFAULT_STATUE_PARAMS, baseFamily };
    const geometry = computeStatueGeometry(params);

    const harness = new BenchmarkHarness(RAPIER, {
      statueParams: params,
      roadParams: DEFAULT_ROAD_PARAMS,
      ropeParams: lateralRopeParams(geometry, 0),
      held: { leftHeld: false, rightHeld: false }
    });

    const massKg = harness.rigidBody.mass();
    const comZ = harness.rigidBody.worldCom().z;
    harness.dispose();

    expect(massKg).toBeCloseTo(params.totalMassKg, 3);
    expect(comZ).toBeCloseTo(geometry.comHeightAnalyticM, 4);
  });
});
