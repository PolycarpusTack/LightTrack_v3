/**
 * The local calendar day of a time, as `YYYY-MM-DD` (stabilisation backlog A-5).
 *
 * Activities are filed by the day they started on the user's clock. The UTC day
 * (`toISOString().split('T')[0]`) differs from it around midnight, so main uses
 * this helper wherever it needs a day.
 */
export function localDay(value: Date | string | number = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
