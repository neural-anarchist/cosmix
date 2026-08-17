import { describe, expect, it } from "vitest";
import { GRAVITY_M_S2 } from "../core/constants";
import { computeThresholds, staticTippingAngleRad } from "./thresholds";

const BASE = {
  massKg: 4000,
  frictionCoefficient: 0.65,
  contactHalfWidthY: 0.56,
  contactKind: "flat" as const,
  attachmentHeightM: 2.45,
  attachmentLateralM: 0.56
};

describe("computeThresholds", () => {
  it("reproduces the reference formulas for a purely lateral pull", () => {
    const t = computeThresholds({ ...BASE, direction: { x: 0, y: 1, z: 0 } });
    const weight = 4000 * GRAVITY_M_S2;

    expect(t.fSlideRefN).toBeCloseTo(0.65 * weight, 6);
    expect(t.fTipRefN).toBeCloseTo((weight * 0.56) / 2.45, 6);
    expect(t.fMinRefN).toBeCloseTo(t.fTipRefN!, 6);
    expect(t.governingRef).toBe("TIPPING");

    // With d = (0,1,0) the geometry-aware values must collapse onto the
    // reference ones — that identity is the check that the general formulas
    // are consistent with the classical special case.
    expect(t.fSlideGeomN).toBeCloseTo(t.fSlideRefN, 6);
    expect(t.fTipGeomN).toBeCloseTo(t.fTipRefN!, 6);
  });

  it("switches the governing mode when friction drops", () => {
    const t = computeThresholds({ ...BASE, frictionCoefficient: 0.1, direction: { x: 0, y: 1, z: 0 } });
    expect(t.governingRef).toBe("SLIDING");
    expect(t.fMinRefN).toBeCloseTo(t.fSlideRefN, 6);
  });

  it("has no tipping threshold for a rocker base", () => {
    const t = computeThresholds({
      ...BASE,
      contactHalfWidthY: 0,
      contactKind: "rocker",
      direction: { x: 0, y: 1, z: 0 }
    });
    expect(t.fTipRefN).toBeNull();
    expect(t.fTipGeomN).toBeNull();
    expect(t.governingRef).toBe("SLIDING");
    expect(t.fMinRefN).toBeCloseTo(t.fSlideRefN, 6);
  });

  it("raises both thresholds for a downward-angled rope", () => {
    const lateral = computeThresholds({ ...BASE, direction: { x: 0, y: 1, z: 0 } });
    const angled = computeThresholds({
      ...BASE,
      // 45 deg downward, still purely in the y-z plane.
      direction: { x: 0, y: Math.SQRT1_2, z: -Math.SQRT1_2 }
    });

    // Pulling downward presses the statue into the road: it needs MORE tension
    // to slide (higher normal load) and MORE to tip (the vertical component
    // acts inboard of the pivot edge, resisting rotation).
    expect(angled.fSlideGeomN!).toBeGreaterThan(lateral.fSlideGeomN!);
    expect(angled.fTipGeomN!).toBeGreaterThan(lateral.fTipGeomN!);
  });

  it("reports sliding as unreachable when the rope pulls down steeply enough", () => {
    // Almost straight down: friction grows faster than drag, so no tension slides it.
    const t = computeThresholds({
      ...BASE,
      frictionCoefficient: 1.2,
      direction: { x: 0, y: 0.2, z: -0.9798 }
    });
    expect(t.fSlideGeomN).toBeNull();
  });

  it("is symmetric under mirroring the pull direction", () => {
    const left = computeThresholds({ ...BASE, attachmentLateralM: 0.56, direction: { x: 0.4, y: 0.8, z: -0.4472 } });
    const right = computeThresholds({ ...BASE, attachmentLateralM: -0.56, direction: { x: 0.4, y: -0.8, z: -0.4472 } });
    expect(right.fTipGeomN!).toBeCloseTo(left.fTipGeomN!, 9);
    expect(right.fSlideGeomN!).toBeCloseTo(left.fSlideGeomN!, 9);
  });

  it("reports no thresholds for the geometry-aware case without a direction", () => {
    const t = computeThresholds({ ...BASE, direction: null });
    expect(t.fSlideGeomN).toBeNull();
    expect(t.fTipGeomN).toBeNull();
    // Reference values are direction-independent and must still be reported.
    expect(t.fSlideRefN).toBeGreaterThan(0);
    expect(t.fTipRefN).toBeGreaterThan(0);
  });
});

describe("staticTippingAngleRad", () => {
  it("is atan(b / z_com) for a flat base", () => {
    expect(staticTippingAngleRad(0.56, 1.6485, "flat")!).toBeCloseTo(Math.atan(0.56 / 1.6485), 12);
  });

  it("is undefined for a rocker", () => {
    expect(staticTippingAngleRad(0, 1.6485, "rocker")).toBeNull();
  });
});
