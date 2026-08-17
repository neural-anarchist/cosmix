interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  precision?: number;
  onChange: (value: number) => void;
  title?: string;
  disabled?: boolean;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 2,
  onChange,
  title,
  disabled
}: SliderFieldProps) {
  return (
    <div className="field">
      <label title={title}>
        <span>{label}</span>
        <span className="val">
          {value.toFixed(precision)}
          {unit ? ` ${unit}` : ""}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
