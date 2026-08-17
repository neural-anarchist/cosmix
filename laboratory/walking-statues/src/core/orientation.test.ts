import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { degToRad, quaternionToRollPitchYaw, radToDeg } from "./orientation";

describe("quaternionToRollPitchYaw", () => {
  it("recovers a pure roll (rotation about x)", () => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      degToRad(12)
    );
    const { roll, pitch, yaw } = quaternionToRollPitchYaw(q.x, q.y, q.z, q.w);
    expect(radToDeg(roll)).toBeCloseTo(12, 6);
    expect(radToDeg(pitch)).toBeCloseTo(0, 6);
    expect(radToDeg(yaw)).toBeCloseTo(0, 6);
  });

  it("recovers a pure pitch (rotation about y)", () => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      degToRad(-8)
    );
    const { roll, pitch, yaw } = quaternionToRollPitchYaw(q.x, q.y, q.z, q.w);
    expect(radToDeg(pitch)).toBeCloseTo(-8, 6);
    expect(radToDeg(roll)).toBeCloseTo(0, 6);
    expect(radToDeg(yaw)).toBeCloseTo(0, 6);
  });

  it("returns the identity orientation as all zeros", () => {
    const { roll, pitch, yaw } = quaternionToRollPitchYaw(0, 0, 0, 1);
    expect(roll).toBeCloseTo(0, 10);
    expect(pitch).toBeCloseTo(0, 10);
    expect(yaw).toBeCloseTo(0, 10);
  });
});
