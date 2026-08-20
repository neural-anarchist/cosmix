import {
  ALL_BASE_FAMILY_IDS,
  foreAftMirrorFamily,
  getBaseModule,
  SYMMETRIC_BASE_FAMILY_IDS
} from "../statue/bases/registry";
import { SHARED_BASE_PARAM_RANGES, type SharedBaseParameterId } from "../statue/bases/shared";
import { useSimStore } from "../state/store";
import type { BaseFamilyId, StatueParams, VisualDetail } from "../statue/types";
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
  label: string;
  step: number;
  title: string;
}[] = [
  { id: "baseWidthRatio", label: "Base width W/H", step: 0.01, title: "W_base / H — maximum lateral extent." },
  { id: "baseLengthRatio", label: "Base length L/H", step: 0.01, title: "L_base / H — fore-aft extent." },
  { id: "baseHeightRatio", label: "Base height H_b/H", step: 0.01, title: "H_base / H." },
  {
    id: "baseLateralRadiusRatio",
    label: "Lateral curvature R_lat/H",
    step: 0.01,
    title: "Lateral rolling radius. For A4 and B5 this is defined as W/2 and the control is inactive."
  },
  {
    id: "baseForeAftRadiusRatio",
    label: "Fore-aft curvature R_fore/H",
    step: 0.01,
    title: "Teardrop tail radius (B2/B3) or fore-aft rolling radius at contact (B5)."
  },
  { id: "baseEdgeRoundingRatio", label: "Edge rounding r/H", step: 0.005, title: "Plan-corner rounding radius." },
  {
    id: "baseFrontBackAsymmetry",
    label: "Front/back asymmetry",
    step: 0.02,
    title: "Splits the fore-aft length as (L/2)(1 ± f). Total length is preserved."
  },
  {
    id: "baseLeftRightAsymmetry",
    label: "Left/right asymmetry",
    step: 0.02,
    title: "Splits the lateral width as (W/2)(1 ± a). Maximum width is preserved."
  },
  { id: "baseOffsetXRatio", label: "Base x-offset / H", step: 0.005, title: "Shifts the base fore or aft under the upper body." },
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
          label="Height H"
          unit="m"
          value={statueParams.heightM}
          min={1.5}
          max={7}
          step={0.05}
          onChange={(v) => setStatueParams({ heightM: v })}
          title="Total statue height, base to crown."
        />
        <SliderField
          label="Mass M"
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
          label="Shoulder width / H"
          value={statueParams.torsoWidthRatio}
          min={0.08}
          max={0.4}
          step={0.01}
          onChange={(v) => setStatueParams({ torsoWidthRatio: v })}
          title="Torso width (y) at the shoulders, the widest point of the upper body."
        />
        <SliderField
          label="Body depth / H"
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
          title="Fractional narrowing from shoulders down to the torso base. 0 reproduces the Phase 1 uniform box."
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
          material, so they change the collider cross-section, the COM and the
          inertia. Setting both to zero reproduces the validated Phase 1 body
          exactly. Intrinsic lean pivots the upper body at the top of the base
          and is reported separately from dynamic pitch in the diagnostics.
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
            ? `Overridden — COM forced to (${(statueParams.comOffsetXRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comOffsetYRatio * statueParams.heightM).toFixed(3)}, ${(statueParams.comHeightRatio * statueParams.heightM).toFixed(3)}) m`
            : `Derived from geometry — z_COM = ${(readout?.comLocal.z ?? 0).toFixed(3)} m`}
        </p>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={statueParams.comOverrideEnabled}
            onChange={(e) => setStatueParams({ comOverrideEnabled: e.target.checked })}
          />
          <span>Override COM explicitly</span>
        </label>
        <SliderField
          label="Forward COM offset x/H"
          precision={3}
          value={statueParams.comOffsetXRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetXRatio: v })}
        />
        <SliderField
          label="Lateral COM offset y/H"
          precision={3}
          value={statueParams.comOffsetYRatio}
          min={-0.15}
          max={0.15}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comOffsetYRatio: v })}
        />
        <SliderField
          label="COM height z/H"
          precision={3}
          value={statueParams.comHeightRatio}
          min={0.15}
          max={0.8}
          step={0.005}
          disabled={!statueParams.comOverrideEnabled}
          onChange={(v) => setStatueParams({ comHeightRatio: v })}
        />
        <p className="hint">
          An override discards the derived mass properties and places the COM
          where you ask, for sweeps where COM is the independent variable.
          Collider shapes are untouched, so contact is unchanged — but the
          rotational inertia is carried over from the derived body rather than
          recomputed, so an overridden statue is an <em>abstract probe, not a
          self-consistent rigid body</em>. The COM marker turns violet to say so.
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
          Affects triangle counts only. A unit test asserts that mass, COM,
          inertia and the collider set are byte-identical across all three
          levels, so the good-looking version and the simulated version can
          never be different statues.
        </p>
      </div>

      <div className="control-card">
        <h3>Base geometry</h3>
        <div className="field">
          <label title="Base family. A-series are symmetric validation shapes; B-series are the fore-aft asymmetric candidates.">
            <span>Base family</span>
          </label>
          <select
            value={statueParams.baseFamily}
            onChange={(e) => setStatueParams({ baseFamily: e.target.value as BaseFamilyId })}
          >
            <optgroup label="A — symmetric (validation / reference)">
              {ALL_BASE_FAMILY_IDS.filter((id) => SYMMETRIC_BASE_FAMILY_IDS.includes(id)).map((id) => (
                <option key={id} value={id}>
                  {getBaseModule(id).label}
                </option>
              ))}
            </optgroup>
            <optgroup label="B — fore-aft asymmetric (candidates)">
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
            This is a <strong>symmetric</strong> family. On a flat symmetric road under
            symmetric forcing it has no mechanism by which to prefer a direction, so it
            is a validation model, not a walking candidate.
          </p>
        ) : (
          <p className="hint">
            Fore-aft asymmetric family.{" "}
            {mirrorFamily
              ? `Its exact fore-aft mirror control is ${mirrorFamily}.`
              : "No exact fore-aft mirror exists for this outline in Phase 2 — a mirrored control trial is not available for it."}
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
          Greyed-out controls are ones this family does not read — the shared schema is
          the same for every base, but a cylinder has no separate lateral radius and a
          rectangle has no tail. Whether a parameter is used is declared by the family
          itself and listed in the diagnostics panel, so nothing is silently ignored.
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
          label="Friction coefficient μ"
          value={roadParams.frictionCoefficient}
          min={0.05}
          max={1.4}
          step={0.01}
          onChange={(v) => setRoadParams({ frictionCoefficient: v })}
          title="Applied to every statue/road contact pair (Phase 1: one shared value)."
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
          Flat road only in Phase 1 — concave and rough modes are Phase 3/5 (see PLAN.md).
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
