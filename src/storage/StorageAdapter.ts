import type { Plan, Settings } from '../types/plan';
import type { ScenarioAssumptions } from '../types/assumptions';

/** The one document the app persists. Everything the user can change lives in here. */
export type StoredDocument = {
  schemaVersion: number;
  plan: Plan;
  settings: Settings;
  /** Exactly the two Phase 4A comparison scenarios. The baseline is `plan` + `settings`. */
  scenarios: StoredScenario[];
};

export type StoredScenario = {
  id: string;
  name: string;
  assumptions: ScenarioAssumptions;
};

/**
 * The minimal persistence surface the store needs. A future backend/API adapter can
 * implement the same three methods without the store changing at all.
 */
export type StorageAdapter = {
  /** Returns `null` when nothing is stored, or when what is stored is unusable. */
  load(): StoredDocument | null;
  save(doc: StoredDocument): void;
  clear(): void;
};
