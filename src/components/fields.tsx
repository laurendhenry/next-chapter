import { useEffect, useId, useState, type ReactNode } from 'react';
import { dollarsToCents, type Cents } from '../types/money';
import { isValidMonthKey } from '../engine/months';
import { centsToInput } from '../lib/format';

/** Small local components only — no design system, per the revised plan. */

export function Section({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 ' +
  'focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';

export function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Dollar input. Keeps its own text so a half-typed value is not destroyed, and only commits
 * to the store once `dollarsToCents` can parse it. Unparseable text shows an inline error.
 */
export function MoneyInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: Cents;
  onCommit: (next: Cents) => void;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => centsToInput(value));
  const [dirty, setDirty] = useState(false);

  // Re-sync when the value changes underneath us (import, reset, scenario switch).
  useEffect(() => {
    if (!dirty) setText(centsToInput(value));
  }, [value, dirty]);

  const parsed = dollarsToCents(text);
  const invalid = text.trim() !== '' && parsed === null;

  return (
    <div>
      <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500">
        <span className="pl-2.5 text-sm text-slate-400">$</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          className="w-full bg-transparent px-1.5 py-1.5 text-sm text-slate-900 focus:outline-none"
          value={text}
          onChange={(e) => {
            setDirty(true);
            setText(e.target.value);
            const next = dollarsToCents(e.target.value);
            if (next !== null) onCommit(next);
          }}
          onBlur={() => {
            setDirty(false);
            const next = dollarsToCents(text);
            setText(centsToInput(next ?? value));
          }}
        />
      </div>
      {invalid ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">
          Enter a number, like 1250.00
        </span>
      ) : null}
    </div>
  );
}

/** "YYYY-MM" input with validation. Uses a native month picker where available. */
export function MonthInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  const [dirty, setDirty] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!dirty) setText(value);
  }, [value, dirty]);

  const invalid = text.trim() !== '' && !isValidMonthKey(text);

  return (
    <div>
      <input
        id={id}
        type="month"
        aria-label={ariaLabel}
        className={inputClass}
        value={text}
        onChange={(e) => {
          setDirty(true);
          setText(e.target.value);
          if (isValidMonthKey(e.target.value)) onCommit(e.target.value);
        }}
        onBlur={() => {
          setDirty(false);
          if (!isValidMonthKey(text)) setText(value);
        }}
      />
      {invalid ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">Use YYYY-MM.</span>
      ) : null}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-accent-600 text-white hover:bg-accent-700'
      : variant === 'danger'
        ? 'border border-rose-200 text-rose-600 hover:bg-rose-50'
        : 'border border-slate-300 text-slate-700 hover:bg-slate-50';
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${styles}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}
