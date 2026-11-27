/**
 * C-4: the user's rules set the project before any guess (IDE folder, "Meetings",
 * default project), tracking matches rules the way the rule tester does, and every
 * rule type applies all its booking fields.
 */
const TitleParser = require('../../src/main/core/title-parser');
const { compileRulePattern } = require('../../src/shared/rule-pattern');

function parserWith({ app = {}, url = {}, jira = {}, meeting = {}, defaultProject = 'General' } = {}) {
  const values = { urlProjectMappings: url, jiraProjectMappings: jira, meetingMappings: meeting };
  return new TitleParser({
    store: { get: key => values[key] },
    getProjectMappings: () => app,
    getSettings: () => ({ defaultProject })
  });
}

const vscode = { owner: { name: 'Visual Studio Code' }, title: 'review.js - LightTrack - Visual Studio Code' };

describe('rule beats guess (C-4-T1)', () => {
  test('rule beats guess: an app rule beats the IDE folder and the meeting guess', () => {
    const result = parserWith({ app: { LightTrack: 'Client A' } }).parse(vscode);
    expect(result.project).toBe('Client A');
    expect(result.tags).toEqual(expect.arrayContaining(['development', 'meeting']));
  });

  test('rule beats guess: a Jira rule beats the meeting guess', () => {
    const window = { owner: { name: 'Chrome' }, title: 'ABC-12 sync notes - Google Chrome' };
    expect(parserWith({ jira: { ABC: 'Client B' } }).parse(window).project).toBe('Client B');
  });

  test('rule beats guess: a URL rule beats the meeting guess', () => {
    const window = { owner: { name: 'Chrome' }, title: 'Call log - Google Chrome', url: 'https://crm.example.com/calls' };
    expect(parserWith({ url: { 'crm.example.com': 'Client C' } }).parse(window).project).toBe('Client C');
  });

  test('rule beats guess: without a rule the guesses still apply', () => {
    expect(parserWith().parse(vscode).project).toBe('Meetings');
    const plain = { owner: { name: 'Visual Studio Code' }, title: 'index.js - LightTrack - Visual Studio Code' };
    expect(parserWith().parse(plain).project).toBe('LightTrack');
    expect(parserWith({ defaultProject: 'Admin' }).parse({ owner: { name: 'Notepad' }, title: 'todo.txt' }).project).toBe('Admin');
  });
});

describe('tester and tracker agree (C-4-T2)', () => {
  const cases = [
    ['/JIRA-\\d+/i', 'Fix jira-42 today', true],
    ['/JIRA-\\d+/i', 'No ticket here', false],
    ['C++ Builder', 'main.cpp - C++ Builder', true],
    ['*Outlook*', 'Inbox - Microsoft Outlook', true],
    ['*/pull/*', 'https://github.com/x/y/pull/3', true],
    ['Visual Studio', 'visual studio code', true],
    ['/(a+)+$/', 'aaaa', false] // refused as unsafe, in both places
  ];

  test.each(cases)('tester and tracker agree: %s on "%s"', (pattern, text, expected) => {
    const matcher = compileRulePattern(pattern);
    expect(matcher ? matcher(text) : false).toBe(expected);

    const tracked = parserWith({ app: { [pattern]: 'Hit' } }).parse({ owner: { name: 'Some App' }, title: text });
    expect(tracked.project === 'Hit').toBe(expected);
  });

  test('tester and tracker agree: every rule type sets all booking fields', () => {
    const booking = { project: 'P', activity: 'Dev', sapCode: 'S1', costCenter: 'C1', wbsElement: 'W1' };
    const fields = r => ({ project: r.project, activity: r.activity, sapCode: r.sapCode, costCenter: r.costCenter, wbsElement: r.wbsElement });

    const byApp = parserWith({ app: { Notepad: booking } }).parse({ owner: { name: 'Notepad' }, title: 'x' });
    const byUrl = parserWith({ url: { 'example.com': booking } }).parse({ owner: { name: 'Chrome' }, title: 'x', url: 'https://example.com' });
    const byMeeting = parserWith({ meeting: { Planning: booking } })
      .parse({ owner: { name: 'Microsoft Teams' }, title: 'Sprint Planning | Microsoft Teams' });
    for (const result of [byApp, byUrl, byMeeting]) expect(fields(result)).toEqual(booking);
  });
});
