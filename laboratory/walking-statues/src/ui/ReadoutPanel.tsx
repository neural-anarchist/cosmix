import { useSimStore } from "../state/store";

const STATUS_LABEL: Record<string, string> = {
  gray: "Not started",
  yellow: "Running",
  red: "Fallen / airborne"
};

export function ReadoutPanel() {
  const readout = useSimStore((s) => s.readout);
  const status = readout?.status ?? "gray";
  const weightN = readout ? readout.thresholds.weightN : 1;

  const leftN = readout?.ropes.left.tensionN ?? 0;
  const rightN = readout?.ropes.right.tensionN ?? 0;

  return (
    <div className="readout-grid">
      <Tile label="Sim time" value={readout ? readout.simTimeS.toFixed(2) : "0.00"} unit="s" />
      <Tile label="Δx (forward)" value={readout ? readout.dxM.toFixed(4) : "0.0000"} unit="m" />
      <Tile label="Δy (lateral)" value={readout ? readout.dyM.toFixed(4) : "0.0000"} unit="m" />
      <Tile label="Roll" value={readout ? readout.rollDeg.toFixed(2) : "0.00"} unit="deg" />
      <Tile label="Pitch" value={readout ? readout.pitchDeg.toFixed(2) : "0.00"} unit="deg" />
      <Tile label="Regime" value={readout?.regime ?? "—"} unit="" />
      <Tile label="Left rope T" value={leftN.toFixed(0)} unit="N" />
      <Tile label="Right rope T" value={rightN.toFixed(0)} unit="N" />
      <Tile label="Applied / Mg" value={((leftN + rightN) / weightN).toFixed(3)} unit="" />
      <Tile
        label="Governing threshold"
        value={readout ? readout.thresholds.fMinRefN.toFixed(0) : "—"}
        unit="N"
      />
      <Tile label="COM height" value={readout ? readout.comHeightM.toFixed(3) : "0.000"} unit="m" />
      <Tile label="Mass (reported)" value={readout ? readout.massKg.toFixed(0) : "0"} unit="kg" />
      <Tile label="Contacts" value={readout ? String(readout.contactCount) : "0"} unit="" />
      <Tile label="Status" value={STATUS_LABEL[status] ?? status} unit="" />
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="readout-tile">
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </span>
    </div>
  );
}
