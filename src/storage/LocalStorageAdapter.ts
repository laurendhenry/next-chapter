import type { StorageAdapter, StoredDocument } from './StorageAdapter';
import { STORAGE_KEY, SCHEMA_VERSION, parseDocument, type Defaults } from './schema';

/**
 * Stores the entire app state as ONE browser-local JSON document under `next-chapter:v1`.
 * No auth, no network, no per-entity keys — one read on boot and one write per change.
 *
 * Every localStorage call is guarded: private-mode, disabled storage, and full quota all
 * degrade to "this session just isn't persisted" instead of an exception.
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(
    private readonly defaults: Defaults,
    private readonly key: string = STORAGE_KEY,
    private readonly backing: Storage | null = safeStorage(),
  ) {}

  load(): StoredDocument | null {
    if (!this.backing) return null;
    let text: string | null = null;
    try {
      text = this.backing.getItem(this.key);
    } catch {
      return null;
    }
    if (text === null) return null;
    try {
      return parseDocument(JSON.parse(text), this.defaults);
    } catch {
      // Malformed JSON — treat it as no saved data rather than crashing the app.
      return null;
    }
  }

  save(doc: StoredDocument): void {
    if (!this.backing) return;
    try {
      this.backing.setItem(this.key, JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION }));
    } catch {
      // Quota or a blocked storage API. Nothing useful to do; the in-memory state still works.
    }
  }

  clear(): void {
    if (!this.backing) return;
    try {
      this.backing.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** In-memory adapter used by tests and by any environment without localStorage. */
export class MemoryStorageAdapter implements StorageAdapter {
  private doc: StoredDocument | null = null;

  load(): StoredDocument | null {
    return this.doc;
  }

  save(doc: StoredDocument): void {
    this.doc = doc;
  }

  clear(): void {
    this.doc = null;
  }
}
