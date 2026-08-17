import { beforeAll, describe, expect, it } from "vitest";
import type * as RAPIER from "@dimforge/rapier3d-compat";
import { GRAVITY_M_S2 } from "../core/constants";
import { getRapier, type RapierModule } from "../physics/rapierSetup";
import { createStatueBody, type StatueBody } from "./body";
import { DEFAULT_STATUE_PARAMS, PHASE1_BASELINE_STATUE_PARAMS } from "./defaults";
import { computeStatueGeometry } from "./geometry";
import type { StatueParams, VisualDetail } from "./types";

let RAPIER_MODULE: RapierModule;

beforeAll(async () => {
  RAPIER_MODULE = await getRapier();
}, 30_000);

/** Builds a statue body in a bare world — no road, no ropes, no renderer. */
function build(overrides: Partial<StatueParams> = {}): { body: StatueBody; world: RAPIER.World } {
  const world = new RAPIER_MODULE.World({ x: 0, y: 0, z: -GRAVITY_M_S2 });
  const body = createStatueBody(
    { ...PHASE1_BASELINE_STATUE_PARAMS, ...overrides },
    RAPIER_MODULE,
    world,
    0.65,
    0.05
  );
  return { body, world };
}

describe("Phase 1 baseline mass configuration", () => {
  /**
   * The single most important test in this file. Phase 1's validated results
   * were produced by a body with total mass 4000 kg and its COM at 1.6485 m; if
   * the Step 1 rewrite moved either of those for the baseline parameters, the
   * validated benchmarks would be certifying a different statue than the one
   * that was signed off.
   */
  it("reproduces the validated Phase 1 mass and COM height exactly", () => {
    const { body, world } = build();

    expect(body.mass.massKg).toBeCloseTo(4000, 3);
    expect(body.mass.comLocal.z).toBeCloseTo(1.6485, 4);
    // Fore-aft and lateral COM sit exactly on the body axis with no lean.
    expect(body.mass.comLocal.x).toBeCloseTo(0, 9);
    expect(body.mass.comLocal.y).toBeCloseTo(0, 9);
    expect(body.mass.comOverridden).toBe(false);

    world.free();
  });

  it("keeps the untapered torso collider identical to the Phase 1 box", () => {
    const geometry = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    // taper 0 => mean cross-section == top == bottom, so the collider is the
    // same uniform cuboid Phase 1 simulated.
    expect(geometry.torso.widthY).toBeCloseTo(geometry.torso.widthTopY, 12);
    expect(geometry.torso.widthY).toBeCloseTo(geometry.torso.widthBottomY, 12);
    expect(geometry.torso.depthX).toBeCloseTo(geometry.torso.depthTopX, 12);
    expect(geometry.torso.widthY).toBeCloseTo(0.22 * 3.5, 12);
    expect(geometry.torso.depthX).toBeCloseTo(0.16 * 3.5, 12);
  });

  it("builds exactly three labelled compound components", () => {
    const { body, world } = build();
    expect(body.colliderInfo.map((c) => c.component)).toEqual(["base", "torso", "head"]);
    // Every component must state how its collider approximates its visual.
    for (const info of body.colliderInfo) {
      expect(info.approximation.length).toBeGreaterThan(20);
    }
    world.free();
  });

  it("leaves the upper body unrotated and on-axis when lean is zero", () => {
    const g = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    expect(g.forwardLeanRad).toBe(0);
    expect(g.torsoPlacement.position.x).toBeCloseTo(0, 12);
    expect(g.torsoPlacement.position.z).toBeCloseTo(g.torso.centerZ, 12);
    expect(g.headPlacement.position.x).toBeCloseTo(0, 12);
    expect(g.headPlacement.position.z).toBeCloseTo(g.head.centerZ, 12);
    expect(g.torsoPlacement.rotation.w).toBeCloseTo(1, 12);
  });
});

describe("analytic geometry vs Rapier's own mass properties", () => {
  /**
   * The analytic COM is what the threshold math and the diagnostics quote; the
   * Rapier COM is what actually gets simulated. Checking them against each other
   * across taper, lean and mass-fraction variations means a density, volume or
   * lean-transform error cannot pass silently in any of those paths.
   */
  const cases: { name: string; params: Partial<StatueParams> }[] = [
    { name: "baseline", params: {} },
    { name: "tapered", params: { torsoTaper: 0.35 } },
    { name: "leaned", params: { forwardLeanDeg: 12 } },
    { name: "leaned backward", params: { forwardLeanDeg: -8 } },
    { name: "tapered + leaned", params: { torsoTaper: 0.3, forwardLeanDeg: 15 } },
    { name: "head-heavy", params: { headMassFraction: 0.4, baseMassFraction: 0.2 } },
    { name: "base-heavy", params: { baseMassFraction: 0.6, headMassFraction: 0.1 } },
    { name: "A4 rocker", params: { baseFamily: "A4" } },
    { name: "A4 rocker + lean", params: { baseFamily: "A4", forwardLeanDeg: 10 } },
    { name: "app defaults", params: DEFAULT_STATUE_PARAMS }
  ];

  it.each(cases)("agrees on mass and COM for $name", ({ params }) => {
    const { body, world } = build(params);
    const geometry = body.geometry;

    expect(body.mass.massKg).toBeCloseTo(geometry.totalMassKg, 2);
    expect(body.mass.comLocal.x).toBeCloseTo(geometry.comLocalAnalytic.x, 4);
    expect(body.mass.comLocal.y).toBeCloseTo(geometry.comLocalAnalytic.y, 4);
    expect(body.mass.comLocal.z).toBeCloseTo(geometry.comLocalAnalytic.z, 4);

    world.free();
  });
});

describe("torso taper", () => {
  it("narrows the torso toward the bottom and collides at the mean cross-section", () => {
    const g = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, torsoTaper: 0.4 });
    expect(g.torso.widthBottomY).toBeCloseTo(g.torso.widthTopY * 0.6, 12);
    expect(g.torso.depthBottomX).toBeCloseTo(g.torso.depthTopX * 0.6, 12);
    expect(g.torso.widthY).toBeCloseTo((g.torso.widthTopY + g.torso.widthBottomY) / 2, 12);
    expect(g.torso.depthX).toBeCloseTo((g.torso.depthTopX + g.torso.depthBottomX) / 2, 12);
    // Narrower mean cross-section than the untapered case.
    const flat = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    expect(g.torso.widthY).toBeLessThan(flat.torso.widthY);
  });

  it("changes rotational inertia while preserving total mass", () => {
    const flat = build({ torsoTaper: 0 });
    const tapered = build({ torsoTaper: 0.45 });

    // Mass is a parameter, not a consequence of shape: it must not drift.
    expect(tapered.body.mass.massKg).toBeCloseTo(flat.body.mass.massKg, 2);
    // A narrower torso concentrates its material closer to the vertical axis,
    // so the about-z inertia must fall.
    expect(tapered.body.mass.principalInertia.z).toBeLessThan(flat.body.mass.principalInertia.z);
    // COM height is unaffected: the collider is a uniform cuboid either way, so
    // its centroid stays at the torso's mid-height.
    expect(tapered.body.mass.comLocal.z).toBeCloseTo(flat.body.mass.comLocal.z, 6);

    flat.world.free();
    tapered.world.free();
  });

  it("rejects a taper that would collapse the torso cross-section", () => {
    expect(() => computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, torsoTaper: 1 })).toThrow(
      /torsoTaper must be in \[0, 1\)/
    );
    expect(() => computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, torsoTaper: -0.1 })).toThrow(
      /torsoTaper must be in \[0, 1\)/
    );
  });
});

describe("intrinsic forward lean", () => {
  it("moves the COM forward by the analytically predicted amount", () => {
    const leanDeg = 10;
    const { body, world } = build({ forwardLeanDeg: leanDeg });

    // Upper body pivots about the base top at z = 0.56. Torso centroid is
    // 1.26 m above it, head centroid 2.73 m above it.
    //   COM_x = (m_torso*1.26 + m_head*2.73) * sin(lean) / M
    //         = (1600*1.26 + 1000*2.73) * sin(10 deg) / 4000
    const expectedX = ((1600 * 1.26 + 1000 * 2.73) * Math.sin((leanDeg * Math.PI) / 180)) / 4000;
    expect(body.mass.comLocal.x).toBeCloseTo(expectedX, 3);
    expect(expectedX).toBeGreaterThan(0.15); // non-trivial, so this can't pass vacuously

    world.free();
  });

  it("leans backward for a negative angle and stays symmetric about zero", () => {
    const fwd = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, forwardLeanDeg: 14 });
    const back = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, forwardLeanDeg: -14 });
    expect(fwd.comLocalAnalytic.x).toBeGreaterThan(0);
    expect(back.comLocalAnalytic.x).toBeCloseTo(-fwd.comLocalAnalytic.x, 9);
    expect(back.comLocalAnalytic.z).toBeCloseTo(fwd.comLocalAnalytic.z, 9);
  });

  it("lowers the COM, because leaning trades height for reach", () => {
    const upright = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    const leaned = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, forwardLeanDeg: 20 });
    expect(leaned.comLocalAnalytic.z).toBeLessThan(upright.comLocalAnalytic.z);
  });

  it("carries the rope attachments forward with the shoulders", () => {
    const upright = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    const leaned = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, forwardLeanDeg: 15 });

    expect(upright.defaultAttachment.left.x).toBeCloseTo(0, 12);
    expect(leaned.defaultAttachment.left.x).toBeGreaterThan(0.2);
    // Both attachments move forward together and stay mirror-symmetric in y.
    expect(leaned.defaultAttachment.right.x).toBeCloseTo(leaned.defaultAttachment.left.x, 12);
    expect(leaned.defaultAttachment.right.y).toBeCloseTo(-leaned.defaultAttachment.left.y, 12);
  });

  it("does not move the base, whose ground contact must be unaffected", () => {
    const upright = computeStatueGeometry(PHASE1_BASELINE_STATUE_PARAMS);
    const leaned = computeStatueGeometry({ ...PHASE1_BASELINE_STATUE_PARAMS, forwardLeanDeg: 18 });
    // Lean is an upper-body transform: leaning the whole body would be
    // indistinguishable from dynamic pitch and would change which part of the
    // base touches down.
    expect(leaned.base.topZ).toBeCloseTo(upright.base.topZ, 12);
    expect(leaned.base.contactHalfWidthY).toBeCloseTo(upright.base.contactHalfWidthY, 12);
    expect(leaned.leanPivot).toEqual({ x: 0, y: 0, z: upright.base.topZ });
  });
});

describe("explicit COM override", () => {
  it("places the COM exactly where asked and preserves total mass", () => {
    const H = PHASE1_BASELINE_STATUE_PARAMS.heightM;
    const { body, world } = build({
      comOverrideEnabled: true,
      comOffsetXRatio: 0.05,
      comOffsetYRatio: -0.02,
      comHeightRatio: 0.4
    });

    expect(body.mass.comOverridden).toBe(true);
    expect(body.mass.massKg).toBeCloseTo(4000, 2);
    expect(body.mass.comLocal.x).toBeCloseTo(0.05 * H, 4);
    expect(body.mass.comLocal.y).toBeCloseTo(-0.02 * H, 4);
    expect(body.mass.comLocal.z).toBeCloseTo(0.4 * H, 4);

    world.free();
  });

  it("leaves collider shapes untouched, so contact behaviour is unchanged", () => {
    const derived = build();
    const overridden = build({ comOverrideEnabled: true, comHeightRatio: 0.3 });

    expect(overridden.body.colliders.length).toBe(derived.body.colliders.length);
    for (let i = 0; i < derived.body.colliders.length; i++) {
      const a = derived.body.colliders[i]!;
      const b = overridden.body.colliders[i]!;
      expect(b.shape.type).toBe(a.shape.type);
      const at = a.translation();
      const bt = b.translation();
      expect(bt.x).toBeCloseTo(at.x, 9);
      expect(bt.y).toBeCloseTo(at.y, 9);
      expect(bt.z).toBeCloseTo(at.z, 9);
    }

    derived.world.free();
    overridden.world.free();
  });

  it("is inert until enabled, so the offsets can sit at non-zero defaults safely", () => {
    const { body, world } = build({
      comOverrideEnabled: false,
      comOffsetXRatio: 0.5,
      comHeightRatio: 0.9
    });
    // Derived COM, not the offsets above.
    expect(body.mass.comLocal.z).toBeCloseTo(1.6485, 4);
    expect(body.mass.comLocal.x).toBeCloseTo(0, 9);
    expect(body.mass.comOverridden).toBe(false);
    world.free();
  });
});

describe("visual detail is mechanically inert", () => {
  /**
   * Directly asserts the Step 1 acceptance criterion "changing visual detail
   * alone does not change mechanics". Tessellation is the one knob that must
   * provably never reach the physics.
   */
  const details: VisualDetail[] = ["low", "medium", "high"];

  it("produces identical mass, COM and inertia at every tessellation level", () => {
    const results = details.map((visualDetail) => {
      const { body, world } = build({ visualDetail });
      const snapshot = {
        massKg: body.mass.massKg,
        com: { ...body.mass.comLocal },
        inertia: { ...body.mass.principalInertia },
        colliderCount: body.colliders.length
      };
      world.free();
      return snapshot;
    });

    const [first, ...rest] = results;
    for (const other of rest) {
      expect(other.massKg).toBe(first!.massKg);
      expect(other.com).toEqual(first!.com);
      expect(other.inertia).toEqual(first!.inertia);
      expect(other.colliderCount).toBe(first!.colliderCount);
    }
  });
});

describe("mass-distribution parameters move the COM predictably", () => {
  it("raises the COM when mass shifts from the base to the head", () => {
    const baseHeavy = build({ baseMassFraction: 0.6, headMassFraction: 0.1 });
    const headHeavy = build({ baseMassFraction: 0.15, headMassFraction: 0.45 });

    expect(headHeavy.body.mass.comLocal.z).toBeGreaterThan(baseHeavy.body.mass.comLocal.z);
    // Total mass is a parameter and must be unaffected by how it is distributed.
    expect(headHeavy.body.mass.massKg).toBeCloseTo(baseHeavy.body.mass.massKg, 2);

    baseHeavy.world.free();
    headHeavy.world.free();
  });

  it("scales inertia with total mass at fixed geometry", () => {
    const light = build({ totalMassKg: 2000 });
    const heavy = build({ totalMassKg: 8000 });

    // Four times the mass in the same shape is four times the inertia.
    expect(heavy.body.mass.principalInertia.y / light.body.mass.principalInertia.y).toBeCloseTo(4, 3);
    // ...and the COM does not move.
    expect(heavy.body.mass.comLocal.z).toBeCloseTo(light.body.mass.comLocal.z, 6);

    light.world.free();
    heavy.world.free();
  });
});
