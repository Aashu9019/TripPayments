import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BS_MONTHS, BS_YEAR_MAX, BS_YEAR_MIN, bsMonthDays, fromBS, getCalendar, toBS } from '../lib/dates';
import { today } from '../lib/format';

/** Re-render when the BS/AD setting changes. */
export function useCalendar() {
  const [cal, setCal] = useState(getCalendar);
  useEffect(() => {
    const on = () => setCal(getCalendar());
    window.addEventListener('calendarchange', on);
    return () => window.removeEventListener('calendarchange', on);
  }, []);
  return cal;
}

/**
 * Date input. Value is always an AD "YYYY-MM-DD" (or '' when optional and unset).
 * In BS mode it is three native selects (day / month / year), which open as
 * wheel pickers on phones; in AD mode it is the browser's date input.
 */
export function DateField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  optional?: boolean;
}) {
  const cal = useCalendar();

  if (cal === 'ad') {
    return (
      <label className="field">
        <span>{label}</span>
        <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  if (!value) {
    return (
      <div className="field">
        <span>{label}</span>
        <button type="button" className="input date-empty" onClick={() => onChange(today())}>
          Set date
        </button>
      </div>
    );
  }

  const b = toBS(value);
  const days = bsMonthDays(b.y, b.m);
  const set = (y: number, m: number, d: number) => onChange(fromBS(y, m, Math.min(d, bsMonthDays(y, m))));

  return (
    <div className="field">
      <span>
        {label} <span className="faint">· BS</span>
      </span>
      <div className="bs-picker">
        <select className="input" aria-label={`${label} day`} value={b.d} onChange={(e) => set(b.y, b.m, Number(e.target.value))}>
          {Array.from({ length: days }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select className="input" aria-label={`${label} month`} value={b.m} onChange={(e) => set(b.y, Number(e.target.value), b.d)}>
          {BS_MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <select className="input" aria-label={`${label} year`} value={b.y} onChange={(e) => set(Number(e.target.value), b.m, b.d)}>
          {Array.from({ length: BS_YEAR_MAX - BS_YEAR_MIN + 1 }, (_, i) => BS_YEAR_MIN + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {optional && (
          <button type="button" className="icon-btn bs-clear" aria-label={`Clear ${label}`} onClick={() => onChange('')}>
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
