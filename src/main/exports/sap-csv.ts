/**
 * SAP ByDesign CSV export (LT3-007). Migrated to TypeScript in LT3-006.
 *
 * Rows are built here, in the main process, from stored activities. The renderer
 * only sends the period, the employee ID and optional per-row description edits,
 * so the preview and the exported file always come from the same code.
 *
 * Raw window titles are never exported. The default Work Description is
 * "<project> - <activity type>", followed by any Jira keys detected for the row.
 *
 * The column layout and line endings match the previous export. They will move
 * into versioned export profiles in LT3-302.
 */

export const HEADERS = [
  'Employee ID',
  'Date',
  'Project',
  'Activity Type',
  'Hours',
  'SAP Code',
  'Cost Center',
  'WBS Element',
  'Work Description',
  'Billable'
] as const;

const DEFAULT_ACTIVITY_TYPE = 'Development';
const MAX_RANGE_DAYS = 366;
const MAX_EMPLOYEE_ID_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_OVERRIDES = 1000;
const JIRA_KEY = /^[A-Z][A-Z0-9]{1,9}-\d+$/;
const ROW_KEY = /^\d{4}-\d{2}-\d{2}\|.{1,200}$/s;
// Spreadsheet apps treat cells starting with these characters as formulas.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Request as received over IPC; nothing about it is trusted. */
export type SapRequestInput = unknown;

export interface SapRequest {
  startDate: Date;
  endDate: Date;
  employeeId: string;
  descriptions: Record<string, string>;
}

/** The subset of a stored activity that the export reads. */
export interface ActivityLike {
  startTime?: string;
  timestamp?: string;
  duration?: number | string;
  project?: string;
  activity?: string;
  activityType?: string;
  sapCode?: string;
  costCenter?: string;
  wbsElement?: string;
  tickets?: unknown[];
  billable?: boolean;
}

export interface SapRow {
  key: string;
  date: string;
  project: string;
  activityType: string;
  hours: number;
  sapCode: string;
  costCenter: string;
  wbsElement: string;
  jiraKeys: string[];
  workDescription: string;
  billable: 'Yes' | 'No';
}

export class SapExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SapExportValidationError';
  }
}

function fail(message: string): never {
  throw new SapExportValidationError(message);
}

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value) fail(`${field} is required`);
  const time = Date.parse(value);
  if (Number.isNaN(time)) fail(`${field} is not a valid date`);
  return new Date(time);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Validate and normalise an export or preview request from the renderer. */
export function validateRequest(options: SapRequestInput, { requireEmployeeId = false } = {}): SapRequest {
  if (!isPlainObject(options)) fail('Request must be an object');

  const startDate = parseInstant(options.startDate, 'startDate');
  const endDate = parseInstant(options.endDate, 'endDate');
  if (endDate < startDate) fail('endDate is before startDate');
  if ((endDate.getTime() - startDate.getTime()) / 86400000 > MAX_RANGE_DAYS) fail(`Period is longer than ${MAX_RANGE_DAYS} days`);

  const employeeId = options.employeeId === undefined ? '' : options.employeeId;
  if (typeof employeeId !== 'string') fail('employeeId must be a string');
  const trimmedId = employeeId.trim();
  if (trimmedId.length > MAX_EMPLOYEE_ID_LENGTH) fail('employeeId is too long');
  if (CONTROL_CHARS.test(trimmedId)) fail('employeeId contains control characters');
  if (requireEmployeeId && !trimmedId) fail('employeeId is required');

  const descriptions: Record<string, string> = {};
  if (options.descriptions !== undefined) {
    const raw = options.descriptions;
    if (!isPlainObject(raw)) fail('descriptions must be an object');
    const entries = Object.entries(raw);
    if (entries.length > MAX_OVERRIDES) fail('Too many description edits');
    for (const [key, value] of entries) {
      if (!ROW_KEY.test(key)) fail('Invalid description row key');
      if (typeof value !== 'string') fail('Description must be a string');
      if (value.length > MAX_DESCRIPTION_LENGTH) fail('Description is too long');
      descriptions[key] = value.replace(/[\r\n\t]+/g, ' ').trim();
    }
  }

  return { startDate, endDate, employeeId: trimmedId, descriptions };
}

/** Local calendar date (YYYY-MM-DD), matching how the renderer groups days. */
function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function defaultDescription(project: string, activityType: string, jiraKeys: readonly string[]): string {
  const base = `${project} - ${activityType}`;
  return jiraKeys.length ? `${base} - ${jiraKeys.join(', ')}` : base;
}

interface Group {
  key: string;
  date: string;
  project: string;
  seconds: number;
  jiraKeys: Set<string>;
  activityType: string;
  sapCode: string;
  costCenter: string;
  wbsElement: string;
  billable: boolean;
}

/**
 * Group activities by local date and project for the selected period.
 * Each row carries a stable key (`date|project`) that description edits refer to.
 */
export function buildRows(
  activities: unknown,
  { startDate, endDate, descriptions = {} }: Pick<SapRequest, 'startDate' | 'endDate'> & Partial<Pick<SapRequest, 'descriptions'>>
): SapRow[] {
  const groups = new Map<string, Group>();

  for (const item of Array.isArray(activities) ? activities : []) {
    if (!isPlainObject(item)) continue;
    const activity = item as ActivityLike;
    const started = new Date(activity.startTime || activity.timestamp || NaN);
    if (Number.isNaN(started.getTime()) || started < startDate || started > endDate) continue;

    const duration = Number(activity.duration);
    if (!Number.isFinite(duration) || duration <= 0) continue;

    const date = localDate(started);
    const project = String(activity.project || 'General');
    const key = `${date}|${project}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key, date, project, seconds: 0, jiraKeys: new Set<string>(),
        activityType: '', sapCode: '', costCenter: '', wbsElement: '',
        // As before LT3-007: the first activity in the group decides (revisit with LT3-202)
        billable: activity.billable !== false
      };
      groups.set(key, group);
    }
    group.seconds += duration;
    const type = activity.activity || activity.activityType;
    if (type) group.activityType = String(type);
    if (activity.sapCode) group.sapCode = String(activity.sapCode);
    if (activity.costCenter) group.costCenter = String(activity.costCenter);
    if (activity.wbsElement) group.wbsElement = String(activity.wbsElement);
    for (const ticket of Array.isArray(activity.tickets) ? activity.tickets : []) {
      const upper = String(ticket).toUpperCase();
      if (JIRA_KEY.test(upper)) group.jiraKeys.add(upper);
    }
  }

  return [...groups.values()]
    .map((g): SapRow => {
      const activityType = g.activityType || DEFAULT_ACTIVITY_TYPE;
      const jiraKeys = [...g.jiraKeys].sort();
      return {
        key: g.key,
        date: g.date,
        project: g.project,
        activityType,
        hours: Math.round((g.seconds / 3600) * 100) / 100,
        sapCode: g.sapCode,
        costCenter: g.costCenter,
        wbsElement: g.wbsElement,
        jiraKeys,
        workDescription: Object.prototype.hasOwnProperty.call(descriptions, g.key)
          ? descriptions[g.key]
          : defaultDescription(g.project, activityType, jiraKeys),
        billable: g.billable ? 'Yes' : 'No'
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project));
}

/** Quote a text cell and neutralise spreadsheet formula injection. */
export function textCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Build the CSV file content. */
export function toCsv(rows: readonly SapRow[], employeeId: string): string {
  const lines = rows.map(row => [
    textCell(employeeId),
    row.date,
    textCell(row.project),
    textCell(row.activityType),
    row.hours.toFixed(2),
    textCell(row.sapCode),
    textCell(row.costCenter),
    textCell(row.wbsElement),
    textCell(row.workDescription),
    row.billable
  ].join(','));
  return [HEADERS.join(','), ...lines].join('\n');
}
