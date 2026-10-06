/**
 * Salesforce case detection (#48).
 *
 * Salesforce titles and URLs carry a case number or record ID but never the
 * client, so LightTrack remembers the client per case (one case belongs to one
 * client; owner decision 2026-10-06). This module only finds the case number.
 *
 * Lightning tab titles look like "00012345 | Case | Salesforce"; the browser adds
 * " - Google Chrome" or " and 3 more pages - Microsoft Edge". Case numbers are
 * usually eight digits, but an org can add a prefix ("CS-0012345").
 */

const CASE_NUMBER = String.raw`[A-Za-z]{0,6}-?\d{4,12}`;

/** "00012345 | Case | ..." at the start of the title or after a separator. */
const RECORD_TAB = new RegExp(String.raw`(?:^|\|\s*)(${CASE_NUMBER})\s*\|\s*Case\b`);
/** "Case: 00012345", "Case #00012345", "Case 00012345". */
const CASE_LABEL = new RegExp(String.raw`\bCase\s*[:#]?\s*(${CASE_NUMBER})\b`, 'i');
/** Console tab without the object name: "00012345 | Service Console | Salesforce". */
const CONSOLE_TAB = /^(\d{8})\s*\|/;

const SALESFORCE_TITLE = /\bsalesforce\b|\bservice console\b/i;
const SALESFORCE_HOST = /(\.lightning\.force\.com|\.my\.salesforce\.com)(\/|$)/i;

export function isSalesforce(title: string, url?: string | null): boolean {
  return SALESFORCE_TITLE.test(title) || (Boolean(url) && SALESFORCE_HOST.test(String(url)));
}

/** The case number in a Salesforce window title, or null. */
export function detectSalesforceCase(title: string | null | undefined, url?: string | null): string | null {
  const text = title || '';
  if (!isSalesforce(text, url)) return null;
  for (const pattern of [RECORD_TAB, CASE_LABEL, CONSOLE_TAB]) {
    const match = pattern.exec(text);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

/** Valid as a stored case key (also used by the IPC contract). */
export const CASE_KEY = /^[A-Z]{0,6}-?\d{4,12}$/;
