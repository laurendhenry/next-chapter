import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlanStore } from '../store/usePlanStore';
import type { AccountType, ItemKind, PlanItem } from '../types/plan';
import { formatCents } from '../lib/format';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  MoneyInput,
  MonthInput,
  Section,
  Select,
  TextInput,
} from '../components/fields';

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'high_yield', label: 'High-yield cash' },
  { value: 'invested', label: 'Invested' },
  { value: 'credit_card', label: 'Credit card (amount owed)' },
];

const RECURRING_KINDS: ItemKind[] = ['income', 'recurring_expense'];

/**
 * The engine repeats `income` every month, so a one-time INFLOW is modelled as an income item
 * whose end month equals its start month. That keeps one-time money in one section of the form.
 */
function isOneTime(item: PlanItem): boolean {
  if (item.kind === 'one_time_expense') return true;
  return item.kind === 'income' && item.endMonth === item.startMonth;
}

/**
 * The one data-entry screen (revised plan §2). A single scrolling form — not a wizard.
 * Every change goes straight into the store, which persists it and recomputes the forecast.
 */
export default function PlanRoute() {
  const plan = usePlanStore((s) => s.plan);
  const settings = usePlanStore((s) => s.settings);
  const baseline = usePlanStore((s) => s.baseline);
  const usedSeedData = usePlanStore((s) => s.usedSeedData);

  const updateSettings = usePlanStore((s) => s.updateSettings);
  const updateAccount = usePlanStore((s) => s.updateAccount);
  const addItem = usePlanStore((s) => s.addItem);
  const updateItem = usePlanStore((s) => s.updateItem);
  const removeItem = usePlanStore((s) => s.removeItem);
  const updateHousing = usePlanStore((s) => s.updateHousing);
  const updateMoveInCosts = usePlanStore((s) => s.updateMoveInCosts);

  const recurring = plan.items.filter((i) => RECURRING_KINDS.includes(i.kind) && !isOneTime(i));
  const oneTime = plan.items.filter(isOneTime);
  const accountOptions = [
    { value: '', label: 'Default (first checking account)' },
    ...plan.accounts.map((a) => ({ value: a.id, label: a.name || a.id })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything here saves to this browser as you type. Nothing is uploaded anywhere.
        </p>
      </div>

      {usedSeedData ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These are empty placeholders, not estimates of your money. Replace the $0 values with
          your real numbers to get a meaningful forecast.
        </p>
      ) : null}

      <Section
        title="Settings"
        description="Only the values the forecast math actually uses."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="First month" hint="The forecast starts here.">
            <MonthInput
              value={settings.startMonth}
              onCommit={(startMonth) => updateSettings({ startMonth })}
              ariaLabel="Forecast start month"
            />
          </Field>
          <Field label="Months to forecast" hint="18 is the plan default.">
            <input
              type="number"
              min={1}
              max={120}
              value={settings.horizonMonths}
              aria-label="Months to forecast"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 1 && next <= 120) {
                  updateSettings({ horizonMonths: Math.trunc(next) });
                }
              }}
            />
          </Field>
          <Field label="Checking floor" hint="Warn me if checking would drop below this.">
            <MoneyInput
              value={settings.checkingFloor}
              onCommit={(checkingFloor) => updateSettings({ checkingFloor })}
              ariaLabel="Checking floor"
            />
          </Field>
          <Field
            label="Emergency target"
            hint={
              settings.emergencyTargetMode === 'months_of_essentials'
                ? 'Ignored while the mode below is months of essentials.'
                : 'A fixed dollar target.'
            }
          >
            <MoneyInput
              value={settings.emergencyTarget}
              onCommit={(emergencyTarget) => updateSettings({ emergencyTarget })}
              ariaLabel="Emergency target amount"
            />
          </Field>
          <Field label="Emergency target mode">
            <Select
              value={settings.emergencyTargetMode}
              options={[
                { value: 'months_of_essentials', label: 'Months of essential spending' },
                { value: 'fixed', label: 'Fixed amount' },
              ]}
              onChange={(emergencyTargetMode) => updateSettings({ emergencyTargetMode })}
              ariaLabel="Emergency target mode"
            />
          </Field>
          {settings.emergencyTargetMode === 'months_of_essentials' ? (
            <Field label="Months of essentials">
              <input
                type="number"
                min={0}
                max={24}
                value={settings.emergencyTargetMonths ?? 3}
                aria-label="Months of essentials"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next >= 0 && next <= 24) {
                    updateSettings({ emergencyTargetMonths: Math.trunc(next) });
                  }
                }}
              />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section
        title="Accounts"
        description="Today's balances. Credit card balances are the amount owed, entered positive."
      >
        <div className="space-y-4">
          {plan.accounts.map((account) => (
            <div
              key={account.id}
              className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field label="Name">
                <TextInput
                  value={account.name}
                  onChange={(name) => updateAccount(account.id, { name })}
                  ariaLabel="Account name"
                />
              </Field>
              <Field label="Type">
                <Select
                  value={account.type}
                  options={ACCOUNT_TYPE_OPTIONS}
                  onChange={(type) => updateAccount(account.id, { type })}
                  ariaLabel="Account type"
                />
              </Field>
              <Field label="Balance">
                <MoneyInput
                  value={account.balance}
                  onCommit={(balance) => updateAccount(account.id, { balance })}
                  ariaLabel={`${account.name} balance`}
                />
              </Field>
              {account.type === 'invested' ? (
                <Field
                  label="Approved for near-term use"
                  hint="How much of this you would actually sell. $0 keeps it untouchable."
                >
                  <MoneyInput
                    value={account.scenarioAvailableAmount ?? (0 as typeof account.balance)}
                    onCommit={(scenarioAvailableAmount) =>
                      updateAccount(account.id, { scenarioAvailableAmount })
                    }
                    ariaLabel="Approved invested amount"
                  />
                </Field>
              ) : (
                <div className="hidden lg:block" />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Monthly income and expenses"
        description="Recurring items. The engine repeats these every month from their start month."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => addItem('income')}>Add income</Button>
            <Button onClick={() => addItem('recurring_expense')}>Add expense</Button>
          </div>
        }
      >
        {recurring.length === 0 ? (
          <EmptyState>No recurring items yet. Add your income and monthly bills.</EmptyState>
        ) : (
          <div className="space-y-4">
            {recurring.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                accountOptions={accountOptions}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="One-time items"
        description="Something that happens in exactly one month, in or out."
        actions={<Button onClick={() => addItem('one_time_expense')}>Add one-time item</Button>}
      >
        {oneTime.length === 0 ? (
          <EmptyState>No one-time items yet.</EmptyState>
        ) : (
          <div className="space-y-4">
            {oneTime.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                accountOptions={accountOptions}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                oneTime
              />
            ))}
          </div>
        )}
      </Section>

      {plan.housing.length > 0 ? (
        <Section
          title="Housing"
          description="Rent lands every month between the start and end month. Move-in costs land once, in the start month."
        >
          <div className="space-y-4">
            {plan.housing.map((h) => (
              <div key={h.id} className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Label">
                    <TextInput
                      value={h.label}
                      onChange={(label) => updateHousing(h.id, { label })}
                      ariaLabel="Housing label"
                    />
                  </Field>
                  <Field label="Monthly rent">
                    <MoneyInput
                      value={h.monthlyRent}
                      onCommit={(monthlyRent) => updateHousing(h.id, { monthlyRent })}
                      ariaLabel={`${h.label} monthly rent`}
                    />
                  </Field>
                  <Field label="Starts">
                    <MonthInput
                      value={h.startMonth}
                      onCommit={(startMonth) => updateHousing(h.id, { startMonth })}
                      ariaLabel="Housing start month"
                    />
                  </Field>
                  <Field label="Ends" hint="Leave blank to run to the end of the forecast.">
                    <MonthInput
                      value={h.endMonth ?? ''}
                      onCommit={(endMonth) => updateHousing(h.id, { endMonth })}
                      ariaLabel="Housing end month"
                    />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Checkbox
                      checked={h.utilitiesIncluded}
                      onChange={(utilitiesIncluded) =>
                        updateHousing(h.id, { utilitiesIncluded })
                      }
                      label="Utilities are included in rent"
                    />
                  </div>
                  {!h.utilitiesIncluded ? (
                    <Field label="Monthly utilities">
                      <MoneyInput
                        value={h.monthlyUtilitiesEstimate ?? (0 as typeof h.monthlyRent)}
                        onCommit={(monthlyUtilitiesEstimate) =>
                          updateHousing(h.id, { monthlyUtilitiesEstimate })
                        }
                        ariaLabel="Monthly utilities"
                      />
                    </Field>
                  ) : null}
                </div>
                {h.moveInCosts ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-sm font-medium text-slate-700">
                      Move-in costs (one outflow in {h.startMonth})
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(
                        [
                          ['securityDeposit', 'Security deposit'],
                          ['firstMonthRent', 'First month rent'],
                          ['applicationFees', 'Application fees'],
                          ['utilitySetup', 'Utility setup'],
                          ['movingTransport', 'Moving / transport'],
                          ['furnitureHousehold', 'Furniture / household'],
                          ['contingency', 'Contingency'],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <MoneyInput
                            value={h.moveInCosts?.[key] ?? (0 as typeof h.monthlyRent)}
                            onCommit={(amount) => updateMoveInCosts(h.id, { [key]: amount })}
                            ariaLabel={label}
                          />
                        </Field>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {baseline.warnings.length > 0 ? (
        <Section title="Input warnings" description="The engine ignored these while calculating.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
            {baseline.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <DataSection />

      <p className="text-sm text-slate-500">
        Lowest projected planning funds: {formatCents(baseline.metrics.lowestPlanningFunds.amount)}{' '}
        in {baseline.metrics.lowestPlanningFunds.month || 'n/a'}.{' '}
        <Link to="/timeline" className="font-medium text-accent-700 hover:underline">
          See the month-by-month timeline
        </Link>
        .
      </p>
    </div>
  );
}

function ItemRow({
  item,
  accountOptions,
  onChange,
  onRemove,
  oneTime = false,
}: {
  item: PlanItem;
  accountOptions: { value: string; label: string }[];
  onChange: (patch: Partial<PlanItem>) => void;
  onRemove: () => void;
  oneTime?: boolean;
}) {
  const isIncome = item.kind === 'income';
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={isIncome ? 'Income name' : 'Expense name'}>
          <TextInput
            value={item.label}
            onChange={(label) => onChange({ label })}
            placeholder={isIncome ? 'Paycheck' : 'Rent'}
            ariaLabel="Item name"
          />
        </Field>
        <Field label="Amount">
          <MoneyInput
            value={item.amount}
            onCommit={(amount) => onChange({ amount })}
            ariaLabel={`${item.label || 'Item'} amount`}
          />
        </Field>
        <Field label={oneTime ? 'Month' : 'Starts'}>
          <MonthInput
            value={item.startMonth}
            onCommit={(startMonth) =>
              // A one-time inflow must not repeat, so its window stays a single month.
              onChange(
                oneTime && isIncome ? { startMonth, endMonth: startMonth } : { startMonth },
              )
            }
            ariaLabel="Start month"
          />
        </Field>
        {oneTime ? (
          <Field label="Direction">
            <Select
              value={item.kind === 'income' ? 'in' : 'out'}
              options={[
                { value: 'out', label: 'Money out' },
                { value: 'in', label: 'Money in' },
              ]}
              onChange={(dir) =>
                onChange(
                  dir === 'in'
                    ? { kind: 'income', endMonth: item.startMonth, required: false }
                    : { kind: 'one_time_expense', endMonth: undefined, required: true },
                )
              }
              ariaLabel="Direction"
            />
          </Field>
        ) : (
          <Field label="Ends" hint="Blank runs to the end of the forecast.">
            <MonthInput
              value={item.endMonth ?? ''}
              onCommit={(endMonth) => onChange({ endMonth })}
              ariaLabel="End month"
            />
          </Field>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Field label="Account">
            <Select
              value={item.accountId ?? ''}
              options={accountOptions}
              onChange={(accountId) => onChange({ accountId })}
              ariaLabel="Account"
            />
          </Field>
          {isIncome ? (
            <Field label="Confidence">
              <Select
                value={item.confidence ?? 'likely'}
                options={[
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'likely', label: 'Likely' },
                  { value: 'uncertain', label: 'Uncertain' },
                ]}
                onChange={(confidence) => onChange({ confidence })}
                ariaLabel="Income confidence"
              />
            </Field>
          ) : (
            <div className="pb-1.5">
              <Checkbox
                checked={item.required}
                onChange={(required) => onChange({ required })}
                label="Required (not discretionary)"
              />
            </div>
          )}
        </div>
        <Button variant="danger" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

/** Export / import / reset. Reuses the same validation the storage layer uses. */
function DataSection() {
  const exportJson = usePlanStore((s) => s.exportJson);
  const importJson = usePlanStore((s) => s.importJson);
  const resetToSeed = usePlanStore((s) => s.resetToSeed);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Section
      title="Your data"
      description="Saved in this browser only. Export a JSON backup any time."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            const blob = new Blob([exportJson()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'next-chapter-plan.json';
            a.click();
            URL.revokeObjectURL(url);
            setStatus('Exported next-chapter-plan.json.');
          }}
        >
          Export JSON
        </Button>
        <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm('Replace everything with empty starter data?')) {
              resetToSeed();
              setStatus('Reset to empty starter data.');
            }
          }}
        >
          Reset
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const text = await file.text();
            setStatus(
              importJson(text)
                ? 'Imported successfully.'
                : 'That file could not be read as a Next Chapter plan.',
            );
          }}
        />
      </div>
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
    </Section>
  );
}
