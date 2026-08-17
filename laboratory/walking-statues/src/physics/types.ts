import type * as RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { RapierModule } from "./rapierSetup";

/** Passed into every road/statue builder so modules don't each re-import
 * and juggle the initialized RAPIER module and world/scene handles. */
export interface BuildContext {
  RAPIER: RapierModule;
  world: RAPIER.World;
  scene: THREE.Scene;
}

/** Common shape for anything that adds meshes/bodies to the world and
 * needs to be cleanly removed on rebuild (parameter change, base-family
 * switch, reset). */
export interface Disposable {
  dispose(): void;
}
