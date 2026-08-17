import type { RopeSide } from "../control/ropeModel";
import { useSimStore, type Axis } from "../state/store";
import { NumberField } from "./NumberField";
import { SliderField } from "./SliderField";

const AXES: Axis[] = ["x", "y", "z"];
const AXIS_TITLE: Record<Axis, string> = {
  x: "Forward along the road",
  y: "Lateral (+ is left)",
  z: "Vertical (up)"
};

const SIDE_LABEL: Record<RopeSide, string> = { left: "Left rope", right: "Right rope" };

export function RopeControls() {
  const ropeParams = useSimStore((s) => s.ropeParams);
  const setRopeTensionN = useSimStore((s) => s.setRopeTensionN);
  const setRopeExternalAnchor = useSimStore((s) => s.setRopeExternalAnchor);
  const setRopeAttachment = useSimStore((s) => s.setRopeAttachment);
  const resnapRopeAttachments = useSimStore((s) => s.resnapRopeAttachments);
  const resetRopeParams = useSimStore((s) => s.resetRopeParams);
  const customized = useSimStore((s) => s.ropeGeometryCustomized);
  const totalMassKg = useSimStore((s) => s.statueParams.totalMassKg);
  const readout = useSimStore((s) => s.readout);

  return (
    <div className="control-card control-card-wide">
      <h3>Rope geometry &amp; tension</h3>

      <SliderField
        label="Rope tension T"
        unit="N"
        precision={0}
        value={ropeParams.tensionN}
        min={200}
        max={40000}
        step={100}
        onChange={setRopeTensionN}
        title="Tension applied along the rope while that side is being hauled."
      />
      <p className="inline-note">
        T / Mg = {(ropeParams.tensionN / (totalMassKg * 9.81)).toFixed(3)}
      </p>

      {(["left", "right"] as RopeSide[]).map((side) => {
        const rope = ropeParams[side];
        const diag = readout?.ropes[side];
        return (
          <div className="rope-group" key={side}>
            <h4>{SIDE_LABEL[side]}</h4>

            <p className="rope-sub">Haulers (world position)</p>
            <div className="num-row">
              {AXES.map((axis) => (
                <NumberField
                  key={axis}
                  label={axis}
                  unit="m"
                  value={rope.externalAnchor[axis]}
                  step={0.1}
                  title={AXIS_TITLE[axis]}
                  onChange={(v) => setRopeExternalAnchor(side, axis, v)}
                />
              ))}
            </div>

            <p className="rope-sub">Attachment on statue (body-local)</p>
            <div className="num-row">
              {AXES.map((axis) => (
                <NumberField
                  key={axis}
                  label={axis}
                  unit="m"
                  value={rope.attachmentLocal[axis]}
                  step={0.05}
                  title={AXIS_TITLE[axis]}
                  onChange={(v) => setRopeAttachment(side, axis, v)}
                />
              ))}
            </div>

            {diag ? (
              <p className="rope-decomp">
                <span>
                  d&#770; = ({diag.direction.x.toFixed(3)}, {diag.direction.y.toFixed(3)},{" "}
                  {diag.direction.z.toFixed(3)})
                </span>
                <span>
                  forward {(diag.direction.x * 100).toFixed(0)}% · lateral{" "}
                  {(Math.abs(diag.direction.y) * 100).toFixed(0)}% · vertical{" "}
                  {(diag.direction.z * 100).toFixed(0)}%
                </span>
                <span>rope length {diag.ropeLengthM.toFixed(2)} m</span>
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="reset-row">
        <button className="btn" type="button" onClick={resnapRopeAttachments}>
          Re-snap attachments to statue
        </button>
        <button className="btn" type="button" onClick={resetRopeParams}>
          Restore default geometry
        </button>
      </div>

      <p className="hint">
        Force direction is computed as <code>normalize(haulers − attachment)</code>{" "}
        and applied <em>at the attachment</em>, so it produces the correct moment
        about the contact edge. A rope can only pull, never push. Move a hauler
        and the rendered rope, the force arrow and the numbers above all change
        together — they are one geometry, not two.
        {customized
          ? " Attachments are manually set, so they no longer follow the statue's size; re-snap to restore that."
          : " Attachments follow the statue's geometry until you edit them."}
      </p>
    </div>
  );
}
