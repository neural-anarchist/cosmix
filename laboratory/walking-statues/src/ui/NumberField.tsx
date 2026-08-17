interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  title?: string;
}

/**
 * Compact numeric entry for coordinates, where a slider would be the wrong
 * control: rope anchor positions are read off and typed in as exact figures far
 * more often than they are swept.
 */
export function NumberField({ label, value, min, max, step = 0.05, unit, onChange, title }: NumberFieldProps) {
  return (
    <label className="num-field" title={title}>
      <span className="num-label">
        {label}
        {unit ? <span className="num-unit"> {unit}</span> : null}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}
