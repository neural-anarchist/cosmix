import RAPIER from "@dimforge/rapier3d-compat";

let initPromise: Promise<typeof RAPIER> | null = null;

/**
 * @dimforge/rapier3d-compat requires an async WASM init before any RAPIER.*
 * constructor is used. Memoized so multiple callers (engine, tests, hot
 * reload) share one init.
 */
export function getRapier(): Promise<typeof RAPIER> {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => RAPIER);
  }
  return initPromise;
}

export type RapierModule = typeof RAPIER;
