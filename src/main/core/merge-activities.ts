/**
 * Merge activities on the timeline (#39).
 *
 * The earliest selected activity is kept and widened: it takes the earliest start,
 * the latest end, the summed duration and the union of tags and tickets. The other
 * selected activities are removed. The caller writes the returned list in one store
 * write, so a merge either happens completely or not at all.
 */
import { IpcError } from '../../shared/ipc/errors';

type Id = string | number;

export interface StoredActivity {
  id?: Id;
  project?: string | null;
  date?: string | null;
  startTime?: string | number | null;
  endTime?: string | number | null;
  duration?: number | null;
  actualDuration?: number | null;
  tags?: string[] | null;
  tickets?: string[] | null;
  [key: string]: unknown;
}

function time(value: string | number | null | undefined): number {
  const ms = value === null || value === undefined ? NaN : new Date(value).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

function localDate(activity: StoredActivity): string | null {
  if (activity.date) return activity.date;
  const ms = time(activity.startTime);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const union = (lists: (string[] | null | undefined)[]): string[] => [...new Set(lists.flatMap(list => list || []))];

/**
 * @returns the merged activity and the full activity list with the merge applied
 * @throws IpcError NOT_FOUND when an id is unknown, CONFLICT when the activities
 *   differ in project or day or have no valid start time
 */
export function mergeActivities(all: StoredActivity[], ids: Id[]): { merged: StoredActivity; activities: StoredActivity[] } {
  const wanted = new Set(ids.map(String));
  if (wanted.size < 2) {
    throw new IpcError('INVALID_REQUEST', 'Select at least two activities to merge');
  }

  const selected = all.filter(a => wanted.has(String(a.id)));
  if (selected.length !== wanted.size) {
    throw new IpcError('NOT_FOUND', 'Some selected activities no longer exist. Refresh and try again.');
  }
  if (new Set(selected.map(a => a.project || 'General')).size > 1) {
    throw new IpcError('CONFLICT', 'Only activities with the same project can be merged');
  }
  if (selected.some(a => Number.isNaN(time(a.startTime)))) {
    throw new IpcError('CONFLICT', 'An activity without a start time cannot be merged');
  }
  if (new Set(selected.map(localDate)).size > 1) {
    throw new IpcError('CONFLICT', 'Only activities on the same day can be merged');
  }

  const byStart = [...selected].sort((a, b) => time(a.startTime) - time(b.startTime));
  const keep = byStart[0];
  const lastEnd = [...selected]
    .filter(a => !Number.isNaN(time(a.endTime)))
    .sort((a, b) => time(b.endTime) - time(a.endTime))[0];
  const duration = selected.reduce((sum, a) => sum + (a.duration || 0), 0);

  const merged: StoredActivity = {
    ...keep,
    endTime: lastEnd ? lastEnd.endTime : keep.endTime,
    duration,
    actualDuration: selected.reduce((sum, a) => sum + (a.actualDuration ?? a.duration ?? 0), 0),
    tags: union(selected.map(a => a.tags)),
    tickets: union(selected.map(a => a.tickets))
  };

  const keepId = String(keep.id);
  const activities = all
    .filter(a => !wanted.has(String(a.id)) || String(a.id) === keepId)
    .map(a => (String(a.id) === keepId ? merged : a));

  return { merged, activities };
}
