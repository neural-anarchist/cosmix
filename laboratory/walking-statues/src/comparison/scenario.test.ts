import { beforeEach, describe, expect, it } from "vitest";
import { defaultRopeParams } from "../control/ropeDefaults";
import { computeStatueGeometry } from "../statue/geometry";
import { DEFAULT_STATUE_PARAMS } from "../statue/defaults";
import { DEFAULT_ROAD_PARAMS, DEFAULT_ROPE_TENSION_N, useSimStore } from "../state/store";
import { buildConfig } from "./presets";
import { captureScenario, environmentDifferences, newComparisonGroupId } from "./scenario";
import { captureTargets } from "./resolve";
import type { ComparisonEnvironment } from "./types";

const environment = (): ComparisonEnvironment => ({
  roadParams: { ...DEFAULT_ROAD_PARAMS },
  ropeParams: defaultRopeParams(computeStatueGeometry(DEFAULT_STATUE_PARAMS), DEFAULT_ROPE_TENSION_N),
  maxTensionN: DEFAULT_ROPE_TENSION_N,
  fixedTimestepS: 1 / 240,
  solverIterations: 4,
  initialPose: { translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
});

const config = buildConfig("matchedMoaiTrial", captureTargets(DEFAULT_STATUE_PARAMS));

describe("environment differences", () => {
  it("reports nothing when nothing moved", () => {
    expect(environmentDifferences(environment(), environment(), config)).toEqual([]);
  });

  it("catches a road setting nudged after the baseline was captured", () => {
    const changed = environment();
    changed.roadParams.frictionCoefficient = 1.0;
    const differences = environmentDifferences(environment(), changed, config);
    expect(differences).toHaveLength(1);
    expect(differences[0]!.label).toMatch(/friction/i);
    expect(differences[0]!.detail).toContain("0.65");
  });

  it("catches a moved rope anchor and a moved attachment separately", () => {
    const anchorMoved = environment();
    anchorMoved.ropeParams.left.externalAnchor.y += 0.5;
    expect(environmentDifferences(environment(), anchorMoved, config).map((d) => d.id)).toEqual(["ropeAnchors"]);

    const attachmentMoved = environment();
    attachmentMoved.ropeParams.right.attachmentLocal.z += 0.2;
    expect(environmentDifferences(environment(), attachmentMoved, config).map((d) => d.id)).toEqual(["ropeAttachments"]);
  });

  it("catches a changed tension limit, timestep or solver iteration count", () => {
    for (const mutate of [
      (e: ComparisonEnvironment) => { e.maxTensionN = 9000; },
      (e: ComparisonEnvironment) => { e.fixedTimestepS = 1 / 120; },
      (e: ComparisonEnvironment) => { e.solverIterations = 8; }
    ]) {
      const changed = environment();
      mutate(changed);
      expect(environmentDifferences(environment(), changed, config).length).toBeGreaterThan(0);
    }
  });

  it("catches a changed initial pose", () => {
    const moved = environment();
    moved.initialPose.translation.x = 0.5;
    expect(environmentDifferences(environment(), moved, config).map((d) => d.id)).toEqual(["initialPose"]);
  });

  it("ignores differences in quantities the configuration does not lock", () => {
    const unlocked = { ...config, lockRoad: false, lockRopeAnchors: false };
    const changed = environment();
    changed.roadParams.frictionCoefficient = 1.0;
    changed.ropeParams.left.externalAnchor.y += 0.5;
    expect(environmentDifferences(environment(), changed, unlocked)).toEqual([]);
  });
});

describe("scenario capture", () => {
  it("snapshots the parameters and environment by value, not by reference", () => {
    const params = { ...DEFAULT_STATUE_PARAMS };
    const env = environment();
    const scenario = captureScenario({
      role: "baseline",
      label: "A0 baseline",
      rawStatueParams: params,
      environment: env,
      comparisonGroupId: "g1"
    });
    params.heightM = 99;
    env.roadParams.frictionCoefficient = 99;
    expect(scenario.rawStatueParams.heightM).toBe(DEFAULT_STATUE_PARAMS.heightM);
    expect(scenario.environment.roadParams.frictionCoefficient).toBe(DEFAULT_ROAD_PARAMS.frictionCoefficient);
  });

  it("issues distinct group ids", () => {
    expect(newComparisonGroupId()).not.toBe(newComparisonGroupId());
  });
});

describe("the store's comparison workflow", () => {
  beforeEach(() => {
    useSimStore.setState({
      statueParams: { ...DEFAULT_STATUE_PARAMS },
      roadParams: { ...DEFAULT_ROAD_PARAMS },
      ropeParams: defaultRopeParams(computeStatueGeometry(DEFAULT_STATUE_PARAMS), DEFAULT_ROPE_TENSION_N),
      ropeGeometryCustomized: false,
      baselineScenario: null,
      candidateScenario: null,
      environmentDrift: []
    });
    useSimStore.getState().setComparisonPreset("rawGeometry");
    useSimStore.getState().clearComparison();
  });

  it("captures a baseline and a candidate under one group id", () => {
    const store = useSimStore.getState();
    store.setStatueParams({ baseFamily: "A0" });
    store.captureBaseline();
    useSimStore.getState().setStatueParams({ baseFamily: "B2" });
    useSimStore.getState().captureCandidate();

    const { baselineScenario, candidateScenario, comparisonGroupId } = useSimStore.getState();
    expect(baselineScenario!.rawStatueParams.baseFamily).toBe("A0");
    expect(candidateScenario!.rawStatueParams.baseFamily).toBe("B2");
    expect(candidateScenario!.comparisonGroupId).toBe(comparisonGroupId);
    expect(baselineScenario!.comparisonGroupId).toBe(comparisonGroupId);
  });

  it("switches between saved scenarios without losing the shared configuration", () => {
    const store = useSimStore.getState();
    store.setStatueParams({ baseFamily: "A0" });
    store.captureBaseline();
    useSimStore.getState().setComparisonPreset("matchedMoaiTrial");
    useSimStore.getState().setStatueParams({ baseFamily: "B2" });
    useSimStore.getState().captureCandidate();

    const configBefore = useSimStore.getState().comparisonConfig;
    useSimStore.getState().loadScenario("baseline");
    expect(useSimStore.getState().statueParams.baseFamily).toBe("A0");
    expect(useSimStore.getState().comparisonConfig).toBe(configBefore);

    useSimStore.getState().loadScenario("candidate");
    expect(useSimStore.getState().statueParams.baseFamily).toBe("B2");
    expect(useSimStore.getState().comparisonConfig).toBe(configBefore);
  });

  it("does not move rope attachments when the family changes under a locked comparison", () => {
    const store = useSimStore.getState();
    store.setComparisonPreset("matchedMoaiTrial");
    const before = structuredClone(useSimStore.getState().ropeParams);
    useSimStore.getState().setStatueParams({ baseFamily: "B5", heightM: 4.2 });
    expect(useSimStore.getState().ropeParams).toEqual(before);
  });

  it("still re-snaps attachments in raw geometry mode, where nothing is being held equal", () => {
    const store = useSimStore.getState();
    store.setComparisonPreset("rawGeometry");
    const before = structuredClone(useSimStore.getState().ropeParams);
    useSimStore.getState().setStatueParams({ heightM: 5 });
    expect(useSimStore.getState().ropeParams).not.toEqual(before);
  });

  it("flags drift when a locked road setting changes after the baseline is captured", () => {
    const store = useSimStore.getState();
    store.setComparisonPreset("matchedMoaiTrial");
    useSimStore.getState().captureBaseline();
    expect(useSimStore.getState().environmentDrift).toEqual([]);

    useSimStore.getState().setRoadParams({ frictionCoefficient: 1.1 });
    const drift = useSimStore.getState().environmentDrift;
    expect(drift).toHaveLength(1);
    expect(drift[0]!.label).toMatch(/friction/i);
  });

  it("flags drift when a locked rope anchor or tension changes", () => {
    const store = useSimStore.getState();
    store.setComparisonPreset("matchedMoaiTrial");
    useSimStore.getState().captureBaseline();

    useSimStore.getState().setRopeExternalAnchor("left", "y", 5);
    expect(useSimStore.getState().environmentDrift.some((d) => d.id === "ropeAnchors")).toBe(true);

    useSimStore.getState().setRopeTensionN(9999);
    expect(useSimStore.getState().environmentDrift.some((d) => d.id === "maxTension")).toBe(true);
  });

  it("reports no drift for a switch of base family alone", () => {
    // The whole point: changing the shape is what a comparison is for, and must
    // not itself be reported as the environment moving.
    const store = useSimStore.getState();
    store.setComparisonPreset("matchedMoaiTrial");
    useSimStore.getState().captureBaseline();
    useSimStore.getState().setStatueParams({ baseFamily: "B3" });
    expect(useSimStore.getState().environmentDrift).toEqual([]);
  });

  it("exports both scenarios, the shared constraints and the candidate's verdict", () => {
    const store = useSimStore.getState();
    store.setStatueParams({ baseFamily: "A0" });
    store.captureBaseline();
    useSimStore.getState().setComparisonPreset("matchedMoaiTrial");
    useSimStore.getState().setStatueParams({ baseFamily: "B2" });
    useSimStore.getState().captureCandidate();

    const exported = useSimStore.getState().exportComparison();
    expect(exported.comparisonGroupId).toBe(useSimStore.getState().comparisonGroupId);
    expect(exported.baseline!.rawStatueParams.baseFamily).toBe("A0");
    expect(exported.candidate!.rawStatueParams.baseFamily).toBe("B2");
    expect(exported.presetId).toBe("matchedMoaiTrial");
    expect(exported.candidateResolution!.status).toBe("MATCHED_OK");
    expect(exported.config.lockTotalMass).toBe(true);
  });
});
