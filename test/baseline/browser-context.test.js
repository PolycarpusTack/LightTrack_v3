/**
 * #49: context from the browser extension enriches the current activity.
 * The tracker methods run against a minimal tracker state, not a running tracker.
 */
jest.mock('electron', () => ({ app: {}, ipcMain: {}, powerMonitor: { on() {} }, Notification: function () {} }), { virtual: false });
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivityTracker = require('../../src/main/core/activity-tracker');
const TitleParser = require('../../src/main/core/title-parser');

function memoryStore(data = {}) {
  return { data, get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; } };
}

function tracker(data = {}) {
  const storage = { store: memoryStore(data) };
  return {
    isTracking: true,
    storage,
    titleParser: new TitleParser(storage),
    currentActivity: { app: 'Google Chrome', project: 'General', tickets: [] }
  };
}

describe('browser activity', () => {
  test('parses the page title and URL from the extension', () => {
    const t = tracker({ urlProjectMappings: { 'portal.acme.com': { project: 'Acme portal', sapCode: 'S1' } } });
    ActivityTracker.prototype.processBrowserActivity.call(t, {
      title: 'PORTAL-412 Login fails - Jira',
      url: 'https://portal.acme.com/browse/PORTAL-412'
    });
    expect(t.currentActivity.tickets).toContain('PORTAL-412');
    expect(t.currentActivity.project).toBe('Acme portal');
  });
});

describe('page context', () => {
  test('a Jira mapping with booking details sets the project name', () => {
    const t = tracker({ jiraProjectMappings: { PORTAL: { project: 'Acme portal', sapCode: 'S1' } } });
    ActivityTracker.prototype.processPageContext.call(t, { type: 'jira', data: { issueKey: 'portal-412' } });
    expect(t.currentActivity.project).toBe('Acme portal');
    expect(t.currentActivity.tickets).toEqual(['portal-412']);
  });

  test('a plain Jira mapping still works', () => {
    const t = tracker({ jiraProjectMappings: { PORTAL: 'Acme portal' } });
    ActivityTracker.prototype.processPageContext.call(t, { type: 'jira', data: { issueKey: 'PORTAL-1', projectKey: 'PORTAL' } });
    expect(t.currentActivity.project).toBe('Acme portal');
  });

  test('a GitHub repository mapped with booking details sets the project name', () => {
    const t = tracker({ urlProjectMappings: { 'acme/portal': { project: 'Acme portal' } } });
    ActivityTracker.prototype.processPageContext.call(t, { type: 'github', data: { owner: 'acme', repo: 'portal' } });
    expect(t.currentActivity.project).toBe('Acme portal');
  });
});
