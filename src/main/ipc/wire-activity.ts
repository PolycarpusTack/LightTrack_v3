/**
 * Wire format for activities (stabilisation backlog A-2).
 *
 * The store holds two shapes: the tracker writes start and end times as epoch
 * milliseconds, manual entries as ISO text. The IPC contract accepts text only,
 * so every handler that returns an activity converts it here. The store is not
 * changed; LT3-102 defines one stored format (TD-1).
 */
import logger from '../logger';

type Stored = Record<string, unknown>;

const TIME_FIELDS = ['startTime', 'endTime'] as const;

function toIsoText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

/** A copy of the activity with its times as ISO text; an unreadable time becomes null. */
export function toWireActivity<T extends Stored | null | undefined>(activity: T): T {
  if (!activity || typeof activity !== 'object') return activity;
  const wire: Stored = { ...activity };
  for (const field of TIME_FIELDS) {
    if (!(field in activity)) continue;
    const text = toIsoText(activity[field]);
    if (text === null && activity[field] !== null) {
      // Titles and URLs stay out of the log.
      logger.warn('Activity has an unreadable time', { id: activity.id, field });
    }
    wire[field] = text;
  }
  return wire as T;
}

export function toWireActivities<T extends Stored>(activities: T[] | null | undefined): T[] {
  return (activities || []).map(activity => toWireActivity(activity));
}
