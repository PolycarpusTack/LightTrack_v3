/**
 * How a rule pattern matches text (C-4). Used by tracking (TitleParser) and by the
 * rule tester and "matched rule" note in the window, so the three always agree.
 *
 * - `/body/flags` is a regular expression, refused when it looks unsafe (ReDoS);
 * - a pattern with `*` matches with `*` as any characters, anywhere in the text;
 * - anything else is a case-insensitive substring.
 *
 * Matching is case-insensitive unless a regular expression leaves out the `i` flag.
 */
export type RuleMatcher = (text: string) => boolean;

/** Longest text looked at, so a long title cannot make a match slow. */
export const MAX_MATCH_INPUT = 2000;
const MAX_REGEX_LENGTH = 200;
const VALID_FLAGS = /^[gimsuy]*$/;

/** True when a regular expression body looks safe from catastrophic backtracking. */
export function isSafeRegex(body: string): boolean {
  if (body.length > MAX_REGEX_LENGTH) return false;
  // Nested quantifiers: (x+)+, (x*)+, (x+)*, (x?)+ and quantified groups with {n}
  if (/\([^)]*[+*][^)]*\)[+*?]|\([^)]*[+*?][^)]*\)\{/.test(body)) return false;
  // The same alternative twice in a quantified group: (a|a)+
  if (/\(([^|)]+)\|(\1)\)[+*]/.test(body)) return false;
  // Stacked quantifiers
  if (/(\+|\*|\?|\{[^}]+\}){2,}/.test(body)) return false;
  return true;
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The parts of a `/body/flags` pattern, or null when the pattern is not written that way. */
export function regexParts(pattern: string): { body: string; flags: string } | null {
  const last = pattern.lastIndexOf('/');
  if (!pattern.startsWith('/') || last <= 0) return null;
  return { body: pattern.slice(1, last), flags: pattern.slice(last + 1) };
}

/**
 * Compile a pattern once. Returns null for an empty, unsafe or invalid pattern;
 * such a rule never matches, in tracking and in the tester alike.
 */
export function compileRulePattern(pattern: unknown): RuleMatcher | null {
  if (typeof pattern !== 'string') return null;
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  let regex: RegExp;
  const parts = regexParts(trimmed);
  if (parts) {
    if (!parts.body || !VALID_FLAGS.test(parts.flags) || !isSafeRegex(parts.body)) return null;
    try {
      // g and y keep state between calls; a rule asks only "does it match"
      regex = new RegExp(parts.body, parts.flags.replace(/[gy]/g, ''));
    } catch {
      return null;
    }
  } else if (trimmed.includes('*')) {
    regex = new RegExp(trimmed.split('*').map(escapeRegex).join('.*'), 'i');
  } else {
    const needle = trimmed.toLowerCase();
    return text => typeof text === 'string' && text.slice(0, MAX_MATCH_INPUT).toLowerCase().includes(needle);
  }
  return text => typeof text === 'string' && regex.test(text.slice(0, MAX_MATCH_INPUT));
}

/** Why a pattern can never match, for the rule tester; null when it compiles. */
export function rulePatternProblem(pattern: string): string | null {
  if (compileRulePattern(pattern)) return null;
  const parts = regexParts(pattern.trim());
  if (!parts) return 'Enter a pattern';
  if (!VALID_FLAGS.test(parts.flags)) return `Unknown flag in "${parts.flags}"`;
  if (!isSafeRegex(parts.body)) return 'This regular expression could be very slow, so it is not used';
  try {
    new RegExp(parts.body, parts.flags);
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regular expression';
  }
  return 'Invalid regular expression';
}

export type Booking = {
  project?: string | null;
  activity?: string | null;
  sapCode?: string | null;
  costCenter?: string | null;
  wbsElement?: string | null;
};

/** The booking fields of a stored rule value: a project name, or an object with the fields. */
export function bookingOf(mapping: unknown): Booking {
  if (typeof mapping === 'string') return { project: mapping };
  if (!mapping || typeof mapping !== 'object') return {};
  const m = mapping as Record<string, unknown>;
  const pick = (key: string) => (typeof m[key] === 'string' && m[key] ? (m[key] as string) : undefined);
  return {
    project: pick('project'),
    activity: pick('activity'),
    sapCode: pick('sapCode'),
    costCenter: pick('costCenter'),
    wbsElement: pick('wbsElement')
  };
}
