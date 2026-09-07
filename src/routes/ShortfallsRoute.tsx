import { Link } from 'react-router-dom';
import { usePlanStore } from '../store/usePlanStore';
import type { Shortfall, ShortfallSeverity } from '../types/forecast';
import { formatCents, formatMonth } from '../lib/format';
import { EmptyState } from '../components/fields';

const SEVERITY_LABEL: Record<ShortfallSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Heads up',
};

const SEVERITY_STYLE: Record<ShortfallSeverity, string> = {
  critical: 'border-rose-200 bg-rose-50',
  warning: 'border-amber-200 bg-amber-50',
  info: 'border-slate-200 bg-slate-50',
};

const BADGE_STYLE: Record<ShortfallSeverity, string> = {
  critical: 'bg-rose-200 text-rose-900',
  warning: 'bg-amber-200 text-amber-900',
  info: 'bg-slate-200 text-slate-800',
};

/**
 * Chronological list of everything the engine flagged. The severity, cause sentence, amount
 * and suggested levers are all engine output — this screen decides nothing.
 */
export default function ShortfallsRoute() {
  const shortfalls = usePlanStore((s) => s.baseline.shortfalls);
  const accounts = usePlanStore((s) => s.plan.accounts);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shortfalls</h1>
        <p className="mt-1 text-sm text-slate-500">
          Problems the forecast expects, earliest first. Fix the inputs on{' '}
          <Link to="/plan" className="font-medium text-accent-700 hover:underline">
            your plan
          </Link>{' '}
          and this list updates immediately.
        </p>
      </div>

      {shortfalls.length === 0 ? (
        <EmptyState>No projected shortfalls in this plan.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {shortfalls.length} flagged {shortfalls.length === 1 ? 'item' : 'items'} across{' '}
            {new Set(shortfalls.map((s) => s.month)).size} month(s). First one:{' '}
            <span className="font-medium text-slate-900">
              {formatMonth(shortfalls[0]?.month ?? '')}
            </span>
            .
          </p>
          <ul className="space-y-3">
            {shortfalls.map((s) => (
              <ShortfallCard key={s.id} shortfall={s} accountName={accountName} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ShortfallCard({
  shortfall,
  accountName,
}: {
  shortfall: Shortfall;
  accountName: (id: string) => string;
}) {
  return (
    <li className={`rounded-xl border p-4 ${SEVERITY_STYLE[shortfall.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                BADGE_STYLE[shortfall.severity]
              }`}
            >
              {SEVERITY_LABEL[shortfall.severity]}
            </span>
            <span className="text-sm font-medium text-slate-700">
              {formatMonth(shortfall.month)}
            </span>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {shortfall.category.replace('_', ' ')}
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-900">{shortfall.title}</h2>
          <p className="mt-1 text-sm text-slate-700">{shortfall.cause}</p>
        </div>
        {shortfall.amount !== 0 ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
            <p className="tnum text-lg font-semibold text-slate-900">
              {formatCents(shortfall.amount)}
            </p>
          </div>
        ) : null}
      </div>

      {shortfall.affectedAccountIds.length > 0 ? (
        <p className="mt-3 text-xs text-slate-600">
          Accounts: {shortfall.affectedAccountIds.map(accountName).join(', ')}
        </p>
      ) : null}

      {shortfall.suggestedLevers.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Options to consider
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {shortfall.suggestedLevers.map((lever) => (
              <li key={lever}>{lever}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
