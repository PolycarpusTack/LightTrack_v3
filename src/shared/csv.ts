/**
 * CSV cells shared by every export (C-6): the SAP export, Settings > Export CSV and the
 * analytics export. Text cells are always quoted, and a cell that a spreadsheet would
 * read as a formula gets a leading single quote, so a window title such as
 * =HYPERLINK(...) stays text.
 */

// Spreadsheet apps treat cells starting with these characters as formulas.
export const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Quote a text cell and neutralise spreadsheet formula injection. */
export function textCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local day as YYYY-MM-DD, or '' for a missing or invalid time. */
export function dayCell(value: unknown): string {
  const date = toDate(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

/** Local time as HH:MM (24 h), or '' for a missing or invalid time. */
export function timeCell(value: unknown): string {
  const date = toDate(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

function toDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}
