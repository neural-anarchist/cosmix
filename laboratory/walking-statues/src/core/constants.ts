// Coordinate convention (spec-mandated, kept native end to end — see
// ARCHITECTURE.md "Coordinate convention"):
//   x = forward along the road
//   y = lateral, left(+)/right(-) or vice versa depending on camera facing
//   z = vertical
//   roll  = rotation about x (side-to-side tilt)
//   pitch = rotation about y (forward-backward tilt)
// Both Rapier and Three.js are configured to use this frame directly:
// gravity is (0, 0, -g), the road lies in the XY plane, and the camera's
// up vector is (0, 0, 1). No axis-swap transform exists anywhere else in
// the codebase.

export const GRAVITY_M_S2 = 9.81;

/** Fixed physics timestep in seconds, per the spec's initial 1/240 s. */
export const FIXED_TIMESTEP_S = 1 / 240;

/** Maximum physics steps taken per animation frame, guarding against a
 * spiral of death if the tab is backgrounded and resumes with a huge
 * elapsed time. */
export const MAX_SUBSTEPS_PER_FRAME = 8;

/** Rate at which the engine publishes a readout snapshot to the UI store.
 * Physics itself always runs at FIXED_TIMESTEP_S regardless of this value. */
export const READOUT_PUBLISH_HZ = 20;
