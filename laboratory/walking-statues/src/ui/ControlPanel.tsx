import type { ReactNode } from "react";
import {
  ALL_BASE_FAMILY_IDS,
  foreAftMirrorFamily,
  getBaseModule,
  SYMMETRIC_BASE_FAMILY_IDS
} from "../statue/bases/registry";
import { SHARED_BASE_PARAM_RANGES, type SharedBaseParameterId } from "../statue/bases/shared";
import { useSimStore } from "../state/store";
import type { BaseFamilyId, StatueParams, VisualDetail } from "../statue/types";
import { Katex } from "./math/Katex";
import { SliderField } from "./SliderField";

/**
 * The shared base-parameter schema as the UI renders it. Every family gets the
 * same controls in the same order; a family that does not read a parameter has
 * it disabled with the reason shown, rather than the control quietly doing
 * nothing. Ranges come from the schema so a slider and its validator cannot
 * disagree.
 */
const BASE_PARAM_FIELDS: {
  id: SharedBaseParameterId;
  label: ReactNode;
  step: number;
  title: string;
}[] = [
  {
    id: "baseWidthRatio",
    label: <>Base width <Katex tex="W_{\text{base}}/H" srLabel="base width over height" /></>,
    step: 0.01,
    title: "Maximum lateral extent of the base, as a fraction of total height."
  },
  {
    id: "baseLengthRatio",
    label: <>Base length <Katex tex="L_{\text{base}}/H" srLabel="base length over height" /></>,
    step: 0.01,
    title: "Fore-aft extent of the base, as a fraction of total height."
  },
  {
    id: "baseHeightRatio",
    label: <>Base height <Katex tex="H_{\text{base}}/H" srLabel="base height over total height" /></>,
    step: 0.01,
    title: "Height of the base itself, as a fraction of total height."
  },
  {
    id: "baseLateralRadiusRatio",
    label: <>Lateral curvature <Katex tex="R_{\text{lat}}/H" srLabel="lateral radius over height" /></>,
    step: 0.01,
    title: "Lateral rolling radius. For A4 and B5 this is defined as half the base width and the control is inactive."
  },
  {
    id: "baseForeAftRadiusRatio",
    label: <>Fore-aft curvature <Katex tex="R_{\text{fore}}/H" srLabel="fore-aft radius over height" /></>,
    step: 0.01,
    title: "Teardrop tail radius (B2/B3) or fore-aft rolling radius at contact (B5)."
  },
  {
    id: "baseEdgeRoundingRatio",
    label: <>Edge rounding <Katex tex="r/H" srLabel="edge radius over height" /></>,
    step: 0.005,
    title: "Plan-corner rounding radius, as a fraction of total height."
  },
  {
    id: "baseFrontBackAsymmetry",
    label: "Front/back asymmetry",
    step: 0.02,
    title: "Splits the fore-aft length unevenly between front and back while preserving the total length."
  },
  {
    id: "baseLeftRightAsymmetry",
    label: "Left/right asymmetry",
    step: 0.02,
    title: "Splits the lateral width unevenly between left and right while preserving the maximum width."
  },
  {
    id: "baseOffsetXRatio",
    label: <>Base x-offset <Katex tex="x_{\text{base}}/H" srLabel="base offset over height" /></>,
    step: 0.005,
    title: "Shifts the base forward or backward under the upper body."
  },
  {
    id: "baseForwardLeanDeg",
    label: "Base mount lean",
    step: 0.5,
    title: "Angle the base's top face is cut at. Leans the upper body without tilting the footprint."
  }
];

export function ControlPanel() {
  const statueParams = useSimStore((s) => s.statueParams);
  const setStatueParams = useSimStore((s) => s.setStatueParams);
  const resetStatueParams = useSimStore((s) => s.resetStatueParams);
  const roadParams = useSimStore((s) => s.roadParams);
  const setRoadParams = useSimStore((s) => s.setRoadParams);
  const resetRoadParams = useSimStore((s) => s.resetRoadParams);
  const readout = useSimStore((s) => s.readout);

  const baseModule = getBaseModule(statueParams.baseFamily);
  const isSymmetricFamily = SYMMETRIC_BASE_FAMILY_IDS.includes(statueParams.baseFamily);
  const mirrorFamily = foreAftMirrorFamily(statueParams.baseFamily);

  return (
    <div className="controls">
      <div className="control-card">
        <h3>Statue &amp; mass</h3>
        <SliderField
          label={<>Height <Katex tex="H" /></>}
          unit="m"
          value={statueParams.heightM}
          min={1.5}
          max={7}
          step={0.05}
          onChange={(v) => setStatueParams({ heightM: v })}
          title="Total statue height, base to crown."
        />
        <SliderField
          label={<>Mass <Katex tex="M" /></>}
          unit="kg"
          precision={0}
          value={statueParams.totalMassKg}
          min={500}
          max={14000}
          step={50}
          onChange={(v) => setStatueParams({ totalMassKg: v })}
          title="Total statue mass."
        />
        <SliderField
          label="Base mass fraction"
          value={statueParams.baseMassFraction}
          min={0.05}
          max={0.75}
          step={0.01}
          onChange={(v) => setStatueParams({ baseMassFraction: v })}
          title="Fraction of total mass carried by the base."
        />
        <SliderField
          label="Head mass fraction"
          value={statueParams.headMassFraction}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={(v) => setStatueParams({ headMassFraction: v })}
          title="Fraction of total mass carried by the head. Remainder goes to the torso."
        />
        <SliderField
          label={<>Shoulder width <Katex tex="/H" srLabel="over height" /></>}
          value={statueParams.torsoWidthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoWidthRatio: v })}
          title="Torso width (y) at the shoulders, the widest point of the upper body."
        />
        <SliderField
          label={<>Body depth <Katex tex="/H" srLabel="over height" /></>}
          value={statueParams.torsoDepthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoDepthRatio: v })}
          title="Torso depth (x) at the shoulders."
        />
        <SliderField
          label="Torso taper"
          value={statueParams.torsoTaper}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoTaper: v })}
          title="Fractional narrowing from shoulders down to the torso base. 0 reproduces a plain, untapered box."
        />
        <SliderField
          label="Forward lean"
          unit="deg"
          precision={1}
          value={statueParams.forwardLeanDeg}
          min={-15}
          max={30}
          step={0.5}
          onChange={(v) => setStatueParams({ forwardLeanDeg: v })}
          title="Intrinsic lean of the upper body, baked into the geometry. Distinct from dynamic pitch."
        />
        <p className="hint">
          Taper and lean are <em>mechanical</em> parameters: they move real
          material, so they change the collider cross-section, the center of
          mass and the inertia. Setting both to zero gives a plain, upright
          box — the exact shape the checks below were run against. Intrinsic
          lean pivots the upper body at the top of the base and is reported
          separately from dynamic pitch in the physics details.
        </p>
        <div className="reset-row">
          <button className="btn" type="button" onClick={resetStatueParams}>
            Restore defaults
          </button>
        </div>
      </div>

      <div className="control-card">
        <h3>Center of mass</h3>
        <p className="inline-note">
          {statueParams.comOverrideEnabled
            ? `Set by hand — center of mass forced to (${(statueParams.comOffsetXRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comOffsetYRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comHeightRatio * statueParams.heightM).toFixed(3)}) m`
            : `Derived from the statue's geometry — height ${(readout?.comLocal.z ?? 0).toFixed(3)} m`}
        </p>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={statueParams.comOverrideEnabled}
            onChange={(e) => setStatueParams({ comOverrideEnabled: e.target.checked })}
          />
          <span>Set the center of mass by hand</span>
        </label>
        <SliderField
          label={<>Forward offset <Katex tex="x/H" srLabel="x over height" /></>}
          precision={3}
          value={statueParams.comOffsetXRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetXRatio: v })}
        />
        <SliderField
          label={<>Lateral offset <Katex tex="y/H" srLabel="y over height" /></>}
          precision={3}
          value={statueParams.comOffsetYRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetYRatio: v })}
        />
        <SliderField
          label={<>Height <Katex tex="z/H" srLabel="z over height" /></>}
          precision={3}
          value={statueParams.comHeightRatio}
          min={0.15}
          max={0.8}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comHeightRatio: v })}
        />
        <p className="hint">
          Setting this by hand discards the mass properties derived from the
          statue's shape and places the center of mass wherever you ask, for
          testing that one quantity on its own. The collider shapes are
          untouched, so contact is unchanged — but the rotational inertia is
          carried over from the derived body rather than recomputed, so the
          result is <em>not a physically consistent statue</em>, just a
          simplified test case. The center-of-mass marker turns violet to say
          so.
        </p>
      </div>

      <div className="control-card">
        <h3>Visual detail</h3>
        <div className="field">
          <label title="Mesh tessellation only — provably cannot affect the physics.">
            <span>Tessellation</span>
          </label>
          <select
            value={statueParams.visualDetail}
            onChange={(e) => setStatueParams({ visualDetail: e.target.value as VisualDetail })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <p className="hint">
          Affects triangle counts only — a display setting, not a physics one.
          Mass, center of mass, inertia and the collision shapes are checked
          to stay identical across all three levels, so the good-looking
          version and the simulated version can never be different statues.
        </p>
      </div>

      <div className="control-card">
        <h3>Base geometry</h3>
        <div className="field">
          <label title="The shape of the statue's base. Symmetric shapes are reference cases; asymmetric shapes are the ones being tested for a forward-walking effect.">
            <span>Base shape</span>
          </label>
          <select
            value={statueParams.baseFamily}
            onChange={(e) => setStatueParams({ baseFamily: e.target.value as BaseFamilyId })}
          >
            <optgroup label="Symmetric shapes (reference cases)">
              {ALL_BASE_FAMILY_IDS.filter((id) => SYMMETRIC_BASE_FAMILY_IDS.includes(id)).map((id) => (
                <option key={id} value={id}>
                  {getBaseModule(id).label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Asymmetric shapes (test cases)">
              {ALL_BASE_FAMILY_IDS.filter((id) => !SYMMETRIC_BASE_FAMILY_IDS.includes(id)).map((id) => (
                <option key={id} value={id}>
                  {getBaseModule(id).label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <p className="hint">{baseModule.summary}</p>

        {isSymmetricFamily ? (
          <p className="hint">
            This shape is symmetric front-to-back and left-to-right. On a flat,
            symmetric road under symmetric pulling it has no reason to prefer
            a direction, so it can rock in place but can't demonstrate
            directed walking by itself — that's what makes it a useful
            reference case.
          </p>
        ) : (
          <p className="hint">
            This shape is not symmetric front-to-back, which is the kind of
            difference a walking mechanism would need.{" "}
            {mirrorFamily
              ? `Its exact front-to-back mirror image is ${mirrorFamily}, useful for a left/right control comparison.`
              : "No exact mirror image exists for this outline, so a mirrored control comparison isn't available for it."}
          </p>
        )}

        {BASE_PARAM_FIELDS.map((field) => {
          const used = baseModule.usesParameters.includes(field.id);
          const range = SHARED_BASE_PARAM_RANGES[field.id];
          return (
            <SliderField
              key={field.id}
              label={field.label}
              value={statueParams[field.id]}
              min={range.min}
              max={range.max}
              step={field.step}
              disabled={!used}
              onChange={(v) => setStatueParams({ [field.id]: v } as Partial<StatueParams>)}
              title={used ? field.title : `Not read by ${baseModule.id}. ${field.title}`}
            />
          );
        })}

        <p className="hint">
          Greyed-out controls are ones this shape does not use — every shape
          shares the same set of controls, but a cylinder has no separate
          lateral radius and a rectangle has no tail. Which controls are used
          is also listed in "Physics details" below, so nothing is silently
          ignored.
        </p>
      </div>

      <div className="control-card">
        <h3>Road &amp; contact</h3>
        <SliderField
          label="Road length"
          unit="m"
          precision={0}
          value={roadParams.lengthM}
          min={15}
          max={100}
          step={1}
          onChange={(v) => setRoadParams({ lengthM: v })}
        />
        <SliderField
          label="Road width"
          unit="m"
          precision={1}
          value={roadParams.widthM}
          min={2}
          max={16}
          step={0.5}
          onChange={(v) => setRoadParams({ widthM: v })}
        />
        <SliderField
          label={<>Friction coefficient <Katex tex="\mu" srLabel="mu" /></>}
          value={roadParams.frictionCoefficient}
          min={0.05}
          max={1.4}
          step={0.01}
          onChange={(v) => setRoadParams({ frictionCoefficient: v })}
          title="One assumed value, applied to every contact between the statue and the road. Higher values favor tipping over sliding."
        />
        <SliderField
          label="Restitution"
          value={roadParams.restitution}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(v) => setRoadParams({ restitution: v })}
          title="Contact bounciness. Keep low for a statue that should settle, not bounce."
        />
        <p className="hint">
          The road is always flat, rigid and level. Slope, unevenness and give
          in the surface are not modelled.
        </p>
        <div className="reset-row">
          <button className="btn" type="button" onClick={resetRoadParams}>
            Restore defaults
          </button>
        </div>
      </div>
    </div>
  );
}
