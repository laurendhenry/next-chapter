import { Link } from 'react-router-dom';
import { usePlanStore } from '../store/usePlanStore';
import { sortGoals } from '../engine';
import { sumCents, type Cents } from '../types/money';
import type { Goal, GoalFlexibility, GoalPriority } from '../types/plan';
import type { GoalProgress } from '../types/forecast';
import { formatCents, formatMonth } from '../lib/format';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  MoneyInput,
  MonthInput,
  ProgressBar,
  Section,
  Select,
  StatCard,
  TextInput,
} from '../components/fields';

const PRIORITY_OPTIONS: { value: GoalPriority; label: string }[] = [
  { value: 'essential', label: 'Essential — must happen' },
  { value: 'important', label: 'Important' },
  { value: 'optional', label: 'Optional' },
];

const FLEXIBILITY_OPTIONS: { value: GoalFlexibility; label: string }[] = [
  { value: 'fixed', label: 'Fixed — amount and date locked' },
  { value: 'adjustable', label: 'Adjustable — amount can change' },
  { value: 'deferrable', label: 'Deferrable — date can slip' },
  { value: 'cancellable', label: 'Cancellable' },
];

/**
 * Goals = buckets. Money you reserve in a bucket stops counting as free cash, and the
 * "left over" number at the top is the engine's `flexibleFunds`, not a UI calculation.
 */
export default function GoalsRoute() {
  const goals = usePlanStore((s) => s.plan.goals);
  const accounts = usePlanStore((s) => s.plan.accounts);
  const baseline = usePlanStore((s) => s.baseline);
  const goalsMayReserveInvested = usePlanStore((s) => s.settings.goalsMayReserveInvested);
  const updateSettings = usePlanStore((s) => s.updateSettings);
  const addGoal = usePlanStore((s) => s.addGoal);

  const thisMonth = baseline.months[0];
  const progressById = new Map<string, GoalProgress>(
    (thisMonth?.goalProgress ?? []).map((p) => [p.goalId, p]),
  );
  /** A display roll-up of engine values, not a new financial fact. */
  const totalInBuckets = sumCents(
    goals.filter((g) => g.active).map((g) => progressById.get(g.id)?.reserved ?? g.reservedAmount),
  );

  const accountOptions = [
    { value: '', label: 'No preferred account' },
    ...accounts.map((a) => ({ value: a.id, label: a.name || a.id })),
  ];

  const sorted = sortGoals(goals);
  const active = sorted.filter((g) => g.active);
  const inactive = sorted.filter((g) => !g.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Put money in buckets and see what is genuinely left over. Numbers come from the same
          forecast that drives your{' '}
          <Link to="/timeline" className="font-medium text-accent-700 hover:underline">
            timeline
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Money to plan with"
          value={formatCents(baseline.metrics.planningFunds)}
          hint="Cash, near-cash, and any invested money you approved."
        />
        <StatCard
          label="In buckets"
          value={formatCents(totalInBuckets)}
          hint="Reserved across your active goals right now."
        />
        <StatCard
          label="Protected"
          value={formatCents(baseline.metrics.protectedFunds)}
          hint="Essential buckets plus this month's required bills."
          tone="warn"
        />
        <StatCard
          label="Left over"
          value={formatCents(baseline.metrics.flexibleFunds)}
          hint="Free to spend after protected money is set aside."
          tone={baseline.metrics.flexibleFunds > 0 ? 'good' : 'warn'}
        />
      </div>

      <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        Only <span className="font-medium text-slate-900">essential</span> buckets count as
        protected — important and optional buckets still show progress, but the forecast treats
        them as money you could reallocate.
      </p>

      <Section
        title="Reservation rules"
        description="Applies to every goal, and to how shortfalls get reported."
      >
        <Checkbox
          checked={goalsMayReserveInvested}
          onChange={(next) => updateSettings({ goalsMayReserveInvested: next })}
          label="Goals may reserve money held in invested accounts"
        />
        <p className="mt-2 text-xs text-slate-500">
          Off is the conservative default: funding a goal will never sell investments. Turning it
          on lets goal funding draw on approved invested money, and the forecast flags every time
          it does.
        </p>
      </Section>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Active buckets ({active.length})
        </h2>
        <Button variant="primary" onClick={() => addGoal()}>
          Add goal
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState>
          No active goals yet. Add one to start reserving money for something specific.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressById.get(goal.id)}
              accountOptions={accountOptions}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Paused or cancelled ({inactive.length})
          </h2>
          <p className="text-sm text-slate-500">
            These are excluded from every calculation until you switch them back on.
          </p>
          {inactive.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressById.get(goal.id)}
              accountOptions={accountOptions}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GoalCard({
  goal,
  progress,
  accountOptions,
}: {
  goal: Goal;
  progress: GoalProgress | undefined;
  accountOptions: { value: string; label: string }[];
}) {
  const updateGoal = usePlanStore((s) => s.updateGoal);
  const removeGoal = usePlanStore((s) => s.removeGoal);
  const setGoalContribution = usePlanStore((s) => s.setGoalContribution);
  const months = usePlanStore((s) => s.baseline.months);

  const reserved = progress?.reserved ?? goal.reservedAmount;
  const gap = progress?.gap ?? (0 as Cents);
  const percent = goal.targetAmount > 0 ? (reserved / goal.targetAmount) * 100 : 0;

  // What the engine projects for this bucket in its deadline month, if that month is in range.
  const atDeadline = months
    .find((m) => m.month === goal.targetMonth)
    ?.goalProgress.find((p) => p.goalId === goal.id);

  const funded = goal.targetAmount > 0 && gap === 0;
  const shortAtDeadline = atDeadline ? atDeadline.gap > 0 : null;

  return (
    <div
      className={`rounded-xl border bg-white p-5 ${
        goal.active ? 'border-slate-200' : 'border-slate-200 opacity-70'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityChip priority={goal.priority} />
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {goal.flexibility}
            </span>
            <span className="text-xs text-slate-500">
              due {formatMonth(goal.targetMonth)}
              {progress ? ` · ${progress.monthsRemaining} mo left` : ''}
            </span>
          </div>
          <p className="mt-2 truncate text-base font-semibold text-slate-900">
            {goal.name || 'Untitled goal'}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-lg font-semibold text-slate-900">
            {formatCents(reserved)}{' '}
            <span className="text-sm font-normal text-slate-500">
              of {formatCents(goal.targetAmount)}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {funded ? 'Fully funded' : `${formatCents(gap)} to go`}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar percent={percent} tone={funded ? 'ok' : 'short'} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-600">
          Needs{' '}
          <span className="tnum font-medium text-slate-900">
            {formatCents(progress?.requiredMonthlyContribution ?? (0 as Cents))}
          </span>{' '}
          per month to hit the deadline
        </span>
        {shortAtDeadline !== null ? (
          <span className={shortAtDeadline ? 'font-medium text-amber-700' : 'text-emerald-700'}>
            {shortAtDeadline
              ? `Projected short by ${formatCents(atDeadline?.gap ?? (0 as Cents))} in ${formatMonth(goal.targetMonth)}`
              : `Projected fully funded by ${formatMonth(goal.targetMonth)}`}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name">
          <TextInput
            value={goal.name}
            onChange={(name) => updateGoal(goal.id, { name })}
            placeholder="Emergency reserve"
            ariaLabel="Goal name"
          />
        </Field>
        <Field label="Target amount">
          <MoneyInput
            value={goal.targetAmount}
            onCommit={(targetAmount) => updateGoal(goal.id, { targetAmount })}
            ariaLabel={`${goal.name || 'Goal'} target amount`}
          />
        </Field>
        <Field label="Target month">
          <MonthInput
            value={goal.targetMonth}
            onCommit={(targetMonth) => updateGoal(goal.id, { targetMonth })}
            ariaLabel="Target month"
          />
        </Field>
        <Field label="Already set aside" hint="Money in this bucket today.">
          <MoneyInput
            value={goal.reservedAmount}
            onCommit={(reservedAmount) => updateGoal(goal.id, { reservedAmount })}
            ariaLabel={`${goal.name || 'Goal'} reserved amount`}
          />
        </Field>
        <Field label="Priority" hint="Only essential buckets are protected.">
          <Select
            value={goal.priority}
            options={PRIORITY_OPTIONS}
            onChange={(priority) => updateGoal(goal.id, { priority })}
            ariaLabel="Priority"
          />
        </Field>
        <Field label="Flexibility">
          <Select
            value={goal.flexibility}
            options={FLEXIBILITY_OPTIONS}
            onChange={(flexibility) => updateGoal(goal.id, { flexibility })}
            ariaLabel="Flexibility"
          />
        </Field>
        <Field label="Preferred account">
          <Select
            value={goal.preferredAccountId ?? ''}
            options={accountOptions}
            onChange={(preferredAccountId) => updateGoal(goal.id, { preferredAccountId })}
            ariaLabel="Preferred account"
          />
        </Field>
        <Field
          label="Add per month"
          hint="Moves this much into the bucket every month, capped at the target."
        >
          <MoneyInput
            value={goal.monthlyContribution ?? (0 as Cents)}
            onCommit={(amount) => setGoalContribution(goal.id, amount)}
            ariaLabel={`${goal.name || 'Goal'} monthly contribution`}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Field label="Notes">
            <TextInput
              value={goal.notes ?? ''}
              onChange={(notes) => updateGoal(goal.id, { notes })}
              placeholder="Anything you want to remember about this goal"
              ariaLabel="Notes"
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          checked={goal.active}
          onChange={(active) => updateGoal(goal.id, { active })}
          label="Active (counts in the forecast)"
        />
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Delete "${goal.name || 'this goal'}"?`)) removeGoal(goal.id);
          }}
        >
          Delete goal
        </Button>
      </div>
    </div>
  );
}

function PriorityChip({ priority }: { priority: GoalPriority }) {
  const styles =
    priority === 'essential'
      ? 'bg-accent-100 text-accent-800'
      : priority === 'important'
        ? 'bg-slate-200 text-slate-800'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles}`}>
      {priority}
    </span>
  );
}
