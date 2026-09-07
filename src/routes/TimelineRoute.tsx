import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlanStore } from '../store/usePlanStore';
import type { MonthResult } from '../types/forecast';
import { addCents } from '../types/money';
import { formatCents, formatMonth } from '../lib/format';
import { EmptyState } from '../components/fields';

/**
 * Every forecast month, straight from `ForecastResult.months`. No math happens here — the
 * screen only formats values the engine already produced.
 */
export default function TimelineRoute() {
  const baseline = usePlanStore((s) => s.baseline);
  const settings = usePlanStore((s) => s.settings);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  if (baseline.months.length === 0) {
    return (
      <div className="space-y-4">
        <Heading months={0} />
        <EmptyState>
          No months to show yet. Check the start month and horizon on{' '}
          <Link to="/plan" className="font-medium text-accent-700 hover:underline">
            your plan
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Heading months={baseline.months.length} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Month</th>
              <th className="px-4 py-2 text-right font-semibold">Starting</th>
              <th className="px-4 py-2 text-right font-semibold">Income</th>
              <th className="px-4 py-2 text-right font-semibold">Out</th>
              <th className="px-4 py-2 text-right font-semibold">Ending</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {baseline.months.map((month) => (
              <MonthRows
                key={month.month}
                month={month}
                floor={settings.checkingFloor}
                open={openMonth === month.month}
                onToggle={() => setOpenMonth(openMonth === month.month ? null : month.month)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500">
        Lowest point: {formatCents(baseline.metrics.lowestPlanningFunds.amount)} in{' '}
        {formatMonth(baseline.metrics.lowestPlanningFunds.month)}.{' '}
        <Link to="/shortfalls" className="font-medium text-accent-700 hover:underline">
          Review projected problems
        </Link>
        .
      </p>
    </div>
  );
}

function Heading({ months }: { months: number }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
      <p className="mt-1 text-sm text-slate-500">
        {months > 0 ? `${months} months of planning funds, month by month. ` : ''}
        Edit numbers on{' '}
        <Link to="/plan" className="font-medium text-accent-700 hover:underline">
          your plan
        </Link>{' '}
        and this updates immediately.
      </p>
    </div>
  );
}

function MonthRows({
  month,
  floor,
  open,
  onToggle,
}: {
  month: MonthResult;
  floor: number;
  open: boolean;
  onToggle: () => void;
}) {
  const worst = worstSeverity(month);
  const belowFloor = month.endingBillPayFunds < floor;
  // Not a new financial fact — just the three engine totals shown as one column.
  const totalOut = addCents(
    month.requiredOutflows,
    month.discretionaryOutflows,
    month.goalContributions,
  );

  return (
    <>
      <tr
        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
          worst === 'critical' ? 'bg-rose-50/60' : worst === 'warning' ? 'bg-amber-50/50' : ''
        }`}
        onClick={onToggle}
      >
        <th scope="row" className="px-4 py-2 text-left font-medium text-slate-900">
          <span className="mr-1.5 inline-block w-3 text-slate-400">{open ? '−' : '+'}</span>
          {formatMonth(month.month)}
        </th>
        <td className="tnum px-4 py-2 text-right text-slate-600">
          {formatCents(month.openingPlanningFunds)}
        </td>
        <td className="tnum px-4 py-2 text-right text-emerald-700">
          {formatCents(month.income)}
        </td>
        <td className="tnum px-4 py-2 text-right text-slate-700">
          {formatCents(totalOut)}
        </td>
        <td
          className={`tnum px-4 py-2 text-right font-medium ${
            month.endingPlanningFunds < 0 ? 'text-rose-700' : 'text-slate-900'
          }`}
        >
          {formatCents(month.endingPlanningFunds)}
        </td>
        <td className="px-4 py-2">
          <StatusBadge severity={worst} belowFloor={belowFloor} count={month.shortfalls.length} />
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  This month's items
                </p>
                {month.lineItems.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Nothing scheduled this month.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {month.lineItems.map((line) => (
                      <li key={`${line.itemId}-${line.label}`} className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-600">
                          {line.label || line.itemId}
                          {line.required ? '' : ' (flexible)'}
                        </span>
                        <span
                          className={`tnum ${
                            line.kind === 'income' ? 'text-emerald-700' : 'text-slate-700'
                          }`}
                        >
                          {line.kind === 'income' ? '+' : '−'}
                          {formatCents(line.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Balances at month end
                </p>
                <dl className="mt-2 space-y-1 text-sm">
                  <Row label="Cash on hand" value={formatCents(month.endingFullyLiquid)} />
                  <Row label="Near-cash" value={formatCents(month.endingNearLiquid)} />
                  <Row label="Invested" value={formatCents(month.endingInvested)} />
                  <Row label="Card debt" value={formatCents(month.endingCreditCardDebt)} />
                  <Row label="Set aside for goals" value={formatCents(month.protectedFunds)} />
                  <Row label="Free to use" value={formatCents(month.flexibleFunds)} />
                </dl>
                {month.shortfalls.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-rose-700">
                    {month.shortfalls.map((s) => (
                      <li key={s.id}>{s.title}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tnum text-slate-900">{value}</dd>
    </div>
  );
}

export function worstSeverity(month: MonthResult): 'critical' | 'warning' | 'info' | 'none' {
  if (month.shortfalls.some((s) => s.severity === 'critical')) return 'critical';
  if (month.shortfalls.some((s) => s.severity === 'warning')) return 'warning';
  if (month.shortfalls.length > 0) return 'info';
  return 'none';
}

function StatusBadge({
  severity,
  belowFloor,
  count,
}: {
  severity: 'critical' | 'warning' | 'info' | 'none';
  belowFloor: boolean;
  count: number;
}) {
  if (severity === 'none') {
    return (
      <span className="text-xs font-medium text-emerald-700">
        {belowFloor ? 'Below your floor' : 'On track'}
      </span>
    );
  }
  const styles =
    severity === 'critical'
      ? 'bg-rose-100 text-rose-800'
      : severity === 'warning'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  const label = severity === 'critical' ? 'Shortfall' : severity === 'warning' ? 'Warning' : 'Note';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
      {count > 1 ? ` ×${count}` : ''}
    </span>
  );
}
