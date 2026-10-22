import { CURRENCIES } from '../lib/format';

/** Currency for a trip. A native select, so phones show their own wheel picker. */
export function CurrencyField({
  value,
  onChange,
  warnConvert = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Show that changing it relabels existing amounts instead of converting them. */
  warnConvert?: boolean;
}) {
  return (
    <label className="field">
      <span>Currency</span>
      <select className="input currency-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.symbol} · {c.name} ({c.code})
          </option>
        ))}
      </select>
      {warnConvert && (
        <span className="hint" style={{ display: 'block', padding: 0, margin: '6px 0 0' }}>
          Amounts already added keep their numbers; they are not converted.
        </span>
      )}
    </label>
  );
}
