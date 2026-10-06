/**
 * Salesforce case memory (#48): which client a case books to.
 *
 * One case belongs to one client (owner decision 2026-10-06). Assigning a case
 * stores the mapping and moves every stored activity of that case, and the
 * activity being tracked, to the chosen project.
 */
import type { IpcRegistry } from '../registry';
import { IpcError } from '../../../shared/ipc/errors';
import { CASE_KEY } from '../../core/salesforce-case';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sanitizeMappingValue } = require('../../../shared/sanitize') as {
  sanitizeMappingValue: (value: unknown) => string | Mapping | '';
};

type Mapping = { project: string; activity?: string; sapCode?: string; costCenter?: string; wbsElement?: string };
type MappingValue = string | Mapping;
type Activity = Record<string, unknown> & { salesforceCase?: string | null; salesforceCaseAssigned?: boolean };

const STORE_KEY = 'salesforceCaseMappings';

interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

interface Storage {
  store: Store;
  activityCache: unknown;
}

interface Tracker {
  currentActivity: Activity | null;
}

/** Fields a mapping sets on an activity. */
function bookingFields(mapping: MappingValue): Partial<Mapping> {
  if (typeof mapping === 'string') return { project: mapping };
  const { project, activity, sapCode, costCenter, wbsElement } = mapping;
  return Object.fromEntries(
    Object.entries({ project, activity, sapCode, costCenter, wbsElement }).filter(([, v]) => v)
  );
}

/** What assigning a case changes on each of its activities. */
const assignedFields = (mapping: MappingValue) => ({ ...bookingFields(mapping), salesforceCaseAssigned: true });

function caseKey(value: string): string {
  const key = value.trim().toUpperCase();
  if (!CASE_KEY.test(key)) throw new IpcError('INVALID_REQUEST', 'Not a Salesforce case number');
  return key;
}

export class SalesforceHandler {
  constructor(private readonly storage: Storage, private readonly getTracker: () => Tracker | null) {}

  private mappings(): Record<string, MappingValue> {
    return this.storage.store.get<Record<string, MappingValue>>(STORE_KEY, {});
  }

  /** Remember the client for a case and move the case's activities to it. */
  assign(caseNumber: string, value: unknown): { mappings: Record<string, MappingValue>; updated: number } {
    const key = caseKey(caseNumber);
    const mapping = sanitizeMappingValue(value);
    if (!mapping) throw new IpcError('INVALID_REQUEST', 'A project name is required');

    const mappings = { ...this.mappings(), [key]: mapping };
    this.storage.store.set(STORE_KEY, mappings);

    const fields = assignedFields(mapping);
    let updated = 0;
    const activities = this.storage.store.get<Activity[]>('activities', []).map(activity => {
      if (activity.salesforceCase !== key) return activity;
      updated++;
      return { ...activity, ...fields };
    });
    if (updated > 0) {
      this.storage.store.set('activities', activities);
      this.storage.activityCache = null;
    }

    const tracker = this.getTracker();
    if (tracker?.currentActivity?.salesforceCase === key) {
      Object.assign(tracker.currentActivity, fields);
    }
    return { mappings, updated };
  }

  remove(caseNumber: string): Record<string, MappingValue> {
    const key = caseKey(caseNumber);
    const mappings = { ...this.mappings() };
    delete mappings[key];
    this.storage.store.set(STORE_KEY, mappings);
    return mappings;
  }

  registerHandlers(registry: IpcRegistry): void {
    registry.handle('salesforce:get-case-mappings', () => this.mappings());
    registry.handle('salesforce:assign-case', (_event, caseNumber, mapping) => this.assign(caseNumber, mapping));
    registry.handle('salesforce:remove-case-mapping', (_event, caseNumber) => this.remove(caseNumber));
  }
}
