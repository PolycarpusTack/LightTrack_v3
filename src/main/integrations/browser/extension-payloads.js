// extension-payloads.js - Schema checks for browser-extension requests (LT3-004)
//
// Each validator returns { value } with a normalised copy, or { error } with a
// short message. Unknown fields are dropped.

const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function httpUrl(value, max = 2000) {
  if (typeof value !== 'string' || value.length > max) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

/** Timestamps must be ISO strings within a day of now; otherwise use server time. */
function timestamp(value, now) {
  if (typeof value !== 'string') return new Date(now).toISOString();
  const t = Date.parse(value);
  if (Number.isNaN(t) || Math.abs(t - now) > MAX_CLOCK_SKEW_MS) return new Date(now).toISOString();
  return new Date(t).toISOString();
}

function validateBrowserActivity(body, now = Date.now()) {
  if (!isPlainObject(body)) return { error: 'Body must be a JSON object' };
  const url = httpUrl(body.url);
  if (!url) return { error: 'url must be an http(s) URL' };
  const title = text(body.title, 500);
  if (title === null) return { error: 'title must be a string' };
  return {
    value: {
      url,
      title,
      browser: text(body.browser, 50) || 'Unknown',
      timestamp: timestamp(body.timestamp, now)
    }
  };
}

const JIRA_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/;

function validatePageContext(body) {
  if (!isPlainObject(body)) return { error: 'Body must be a JSON object' };
  const url = httpUrl(body.url);
  if (!url) return { error: 'url must be an http(s) URL' };
  if (!isPlainObject(body.data)) return { error: 'data must be an object' };

  if (body.type === 'jira') {
    const issueKey = text(body.data.issueKey, 20);
    if (!issueKey || !JIRA_KEY.test(issueKey)) return { error: 'data.issueKey must be a Jira key' };
    return {
      value: {
        url,
        type: 'jira',
        data: {
          issueKey,
          projectKey: issueKey.split('-')[0],
          summary: text(body.data.summary, 500) || '',
          status: text(body.data.status, 50) || ''
        }
      }
    };
  }

  if (body.type === 'github') {
    const number = Number(body.data.number);
    return {
      value: {
        url,
        type: 'github',
        data: {
          owner: text(body.data.owner, 100) || '',
          repo: text(body.data.repo, 200) || '',
          type: text(body.data.type, 50) || '',
          number: Number.isInteger(number) && number > 0 ? number : null
        }
      }
    };
  }

  return { error: 'type must be jira or github' };
}

module.exports = { validateBrowserActivity, validatePageContext };
