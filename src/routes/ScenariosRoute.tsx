import { Link } from 'react-router-dom';
import { usePlanStore, useScenarioViews, type ScenarioView } from '../store/usePlanStore';
import type { ForecastResult } from '../types/forecast';
import type { ScenarioAssumptions } from '../types/assumptions';
import { formatCents, formatMonth, formatRunway } from '../lib/format';
import { Checkbox, Field, MoneyInput, MonthInput, Section, Select, TextInput } from '../components/fields';

type Column = { key: string; label: string; sublabel: string; forecast: ForecastResult };

/**
 * Baseline versus exactly two comparison scenarios (revised plan §4). Each scenario is stored
 * as three small assumptions, converted into override patches and run through the same pure
 * engine as the baseline — the baseline plan itself is never mutated.
 */
export default function ScenariosRoute() {
  const baseline = usePlanStore((s) => s.baseline);
  const views = useScenarioViews();

  const columns: Column[] = [
    { key: 'baseline', label: 'Baseline', sublabel: 'Your plan as entered', forecast: baseline },
    ...views.map((v) => ({
      key: v.id,
      label: v.name,
      sublabel: describe(v.assumptions),
      forecast: v.forecast,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Two &quot;what if?&quot; cases next to your baseline. Editing a scenario never changes
          your{' '}
          <Link to="/plan" className="font-medium text-accent-700 hover:underline">
            baseline plan
          </Link>
          .
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Metric
              </th>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 text-right">
                  <span className="block font-semibold text-slate-900">{c.label}</span>
                  <span className="block text-xs font-normal text-slate-500">{c.sublabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="Lowest available cash"
              columns={columns}
              render={(f) => formatCents(f.metrics.lowestPlanningFunds.amount)}
            />
            <MetricRow
              label="Month of that low point"
              columns={columns}
              render={(f) => formatMonth(f.metrics.lowestPlanningFunds.month)}
            />
            <MetricRow
              label="First shortfall month"
              columns={columns}
              render={(f) =>
                f.shortfalls[0] ? formatMonth(f.shortfalls[0].month) : 'None projected'
              }
            />
            <MetricRow
              label="Months with a shortfall"
              columns={columns}
              render={(f) => String(new Set(f.shortfalls.map((s) => s.month)).size)}
            />
            <MetricRow
              label="Critical shortfalls"
              columns={columns}
              render={(f) => String(f.shortfalls.filter((s) => s.severity === 'critical').length)}
            />
            <MetricRow
              label="Ending balance"
              columns={columns}
              render={(f) =>
                formatCents(
                  f.months[f.months.length - 1]?.endingPlanningFunds ??
                    f.metrics.planningFunds,
                )
              }
            />
            <MetricRow
              label="Runway (cash + near-cash)"
              columns={columns}
              render={(f) => formatRunway(f.metrics.runwayMonthsConservative)}
            />
            <MetricRow
              label="Exposed to market swings"
              columns={columns}
              render={(f) => formatCents(f.metrics.potentiallyExposedAmount)}
            />
          </tbody>
        </table>
      </div>

      {views.map((view, index) => (
        <ScenarioEditor key={view.id} view={view} index={index} />
      ))}
    </div>
  );
}

function MetricRow({
  label,
  columns,
  render,
}: {
  label: string;
  columns: Column[];
  render: (forecast: ForecastResult) => string;
}) {
  const baselineValue = columns[0] ? render(columns[0].forecast) : '';
  return (
    <tr className="border-t border-slate-100">
      <th scope="row" className="px-4 py-2 text-left font-medium text-slate-700">
        {label}
      </th>
      {columns.map((c, i) => {
        const value = render(c.forecast);
        const changed = i > 0 && value !== baselineValue;
        return (
          <td
            key={c.key}
            className={`tnum px-4 py-2 text-right ${
              changed ? 'font-semibold text-accent-800' : 'text-slate-900'
            }`}
          >
            {value}
          </td>
        );
      })}
    </tr>
  );
}

/** The narrow editor: three supported assumptions, nothing more. */
function ScenarioEditor({ view, index }: { view: ScenarioView; index: number }) {
  const items = usePlanStore((s) => s.plan.items);
  const updateScenario = usePlanStore((s) => s.updateScenario);
  const update = usePlanStore((s) => s.updateScenarioAssumptions);
  const a = view.assumptions;

  const incomeItems = items.filter((i) => i.kind === 'income');
  const incomeOptions = [
    { value: '', label: incomeItems.length > 0 ? 'Choose an income…' : 'No income items yet' },
    ...incomeItems.map((i) => ({ value: i.id, label: i.label || i.id })),
  ];

  return (
    <Section
      title={view.name}
      description="Switch on only the assumptions you want to test. Anything off matches your baseline."
      actions={
        <div className="w-56">
          <Field label="Scenario name">
            <TextInput
              value={view.name}
              onChange={(name) => updateScenario(index, { name })}
              ariaLabel="Scenario name"
            />
          </Field>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 p-3">
          <Checkbox
            checked={a.oneTimeCost.enabled}
            onChange={(enabled) => update(index, { oneTimeCost: { ...a.oneTimeCost, enabled } })}
            label="A one-time cost in a single month"
          />
          {a.oneTimeCost.enabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="What is it?">
                <TextInput
                  value={a.oneTimeCost.label}
                  onChange={(label) => update(index, { oneTimeCost: { ...a.oneTimeCost, label } })}
                  placeholder="Move-in costs"
                  ariaLabel="One-time cost label"
                />
              </Field>
              <Field label="Amount">
                <MoneyInput
                  value={a.oneTimeCost.amount}
                  onCommit={(amount) => update(index, { oneTimeCost: { ...a.oneTimeCost, amount } })}
                  ariaLabel="One-time cost amount"
                />
              </Field>
              <Field label="Month">
                <MonthInput
                  value={a.oneTimeCost.month}
                  onCommit={(month) => update(index, { oneTimeCost: { ...a.oneTimeCost, month } })}
                  ariaLabel="One-time cost month"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <Checkbox
            checked={a.monthlyExpenseChange.enabled}
            onChange={(enabled) =>
              update(index, { monthlyExpenseChange: { ...a.monthlyExpenseChange, enabled } })
            }
            label="A change to monthly costs from a certain month on"
          />
          {a.monthlyExpenseChange.enabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="What changes?">
                <TextInput
                  value={a.monthlyExpenseChange.label}
                  onChange={(label) =>
                    update(index, { monthlyExpenseChange: { ...a.monthlyExpenseChange, label } })
                  }
                  placeholder="Higher rent"
                  ariaLabel="Monthly change label"
                />
              </Field>
              <Field
                label="Amount per month"
                hint="Enter a negative number for a cost you would avoid."
              >
                <MoneyInput
                  value={a.monthlyExpenseChange.amount}
                  onCommit={(amount) =>
                    update(index, { monthlyExpenseChange: { ...a.monthlyExpenseChange, amount } })
                  }
                  ariaLabel="Monthly change amount"
                />
              </Field>
              <Field label="Starting month">
                <MonthInput
                  value={a.monthlyExpenseChange.startMonth}
                  onCommit={(startMonth) =>
                    update(index, {
                      monthlyExpenseChange: { ...a.monthlyExpenseChange, startMonth },
                    })
                  }
                  ariaLabel="Monthly change start month"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <Checkbox
            checked={a.incomeOverride.enabled}
            onChange={(enabled) =>
              update(index, { incomeOverride: { ...a.incomeOverride, enabled } })
            }
            label="Change one income stream"
          />
          {a.incomeOverride.enabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Which income?">
                <Select
                  value={a.incomeOverride.itemId}
                  options={incomeOptions}
                  onChange={(itemId) =>
                    update(index, { incomeOverride: { ...a.incomeOverride, itemId } })
                  }
                  ariaLabel="Income item"
                />
              </Field>
              <Field label="New monthly amount" hint="$0 means the income stops entirely.">
                <MoneyInput
                  value={a.incomeOverride.amount}
                  onCommit={(amount) =>
                    update(index, { incomeOverride: { ...a.incomeOverride, amount } })
                  }
                  ariaLabel="New income amount"
                />
              </Field>
              <Field label="Starting month">
                <MonthInput
                  value={a.incomeOverride.startMonth}
                  onCommit={(startMonth) =>
                    update(index, { incomeOverride: { ...a.incomeOverride, startMonth } })
                  }
                  ariaLabel="Income change start month"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/** One-line summary under a column header. */
function describe(a: ScenarioAssumptions): string {
  const parts: string[] = [];
  if (a.oneTimeCost.enabled && a.oneTimeCost.amount !== 0) {
    parts.push(`${formatCents(a.oneTimeCost.amount)} once`);
  }
  if (a.monthlyExpenseChange.enabled && a.monthlyExpenseChange.amount !== 0) {
    parts.push(`${formatCents(a.monthlyExpenseChange.amount)}/mo`);
  }
  if (a.incomeOverride.enabled && a.incomeOverride.itemId) {
    parts.push(`income → ${formatCents(a.incomeOverride.amount)}/mo`);
  }
  return parts.length === 0 ? 'Same as baseline' : parts.join(' · ');
}
