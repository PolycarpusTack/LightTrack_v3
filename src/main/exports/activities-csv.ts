/**
 * Settings > Export CSV: every stored activity, one row each (C-6).
 * Text cells go through textCell, so a title cannot run as a formula; dates are
 * YYYY-MM-DD and times HH:MM in local time, whatever the system's date format.
 */
import { textCell, dayCell, timeCell } from '../../shared/csv';

export const ACTIVITY_HEADERS = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'App', 'Title', 'Project', 'Billable'] as const;

interface ActivityLike {
  startTime?: unknown;
  endTime?: unknown;
  duration?: unknown;
  app?: unknown;
  title?: unknown;
  project?: unknown;
  billable?: unknown;
}

export function toActivitiesCsv(activities: readonly unknown[]): string {
  const rows = activities.map(item => {
    const a = (item && typeof item === 'object' ? item : {}) as ActivityLike;
    const seconds = Number(a.duration);
    return [
      dayCell(a.startTime),
      timeCell(a.startTime),
      timeCell(a.endTime),
      Number.isFinite(seconds) ? Math.round(seconds / 60) : 0,
      textCell(a.app),
      textCell(a.title),
      textCell(a.project || 'General'),
      a.billable !== false ? 'Yes' : 'No'
    ].join(',');
  });
  return [ACTIVITY_HEADERS.join(','), ...rows].join('\n');
}
