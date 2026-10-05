/**
 * SAP CSV export (LT3-007): row building, default descriptions, escaping and
 * request validation. The golden string pins the current file format.
 */
const sapCsv = require('../../src/main/exports/sap-csv');

// Local-time instants, so local-date grouping is stable in any time zone.
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h).toISOString();

const activities = [
  { startTime: at(2026, 10, 5, 9), duration: 3600, project: 'Atlas', activityType: 'Development',
    title: 'secret-customer-contract.docx - Word', tickets: ['ATL-12', '#45'], sapCode: 'S1', costCenter: 'CC1', wbsElement: 'W1' },
  { startTime: at(2026, 10, 5, 11), duration: 1800, project: 'Atlas', title: 'ATL-7 fix login', tickets: ['atl-7'] },
  { startTime: at(2026, 10, 5, 13), duration: 900, project: '=HYPERLINK("http://x")', billable: false, title: 'evil' },
  { startTime: at(2026, 10, 6, 9), duration: 7200, title: 'no project' },
  { startTime: at(2026, 10, 12, 9), duration: 3600, project: 'Atlas', title: 'outside period' },
  { startTime: 'not a date', duration: 60, project: 'Broken' },
  { startTime: at(2026, 10, 6, 10), duration: 0, project: 'Empty' }
];

const period = { startDate: new Date(2026, 9, 5, 0, 0, 0), endDate: new Date(2026, 9, 11, 23, 59, 59) };

describe('SAP CSV export', () => {
  test('groups by local date and project, skips invalid and out-of-period activities', () => {
    const rows = sapCsv.buildRows(activities, period);
    expect(rows.map(r => r.key)).toEqual([
      '2026-10-05|=HYPERLINK("http://x")',
      '2026-10-05|Atlas',
      '2026-10-06|General'
    ]);
    const atlas = rows[1];
    expect(atlas.hours).toBe(1.5);
    expect(atlas.jiraKeys).toEqual(['ATL-12', 'ATL-7']);
  });

  test('never exports raw window titles; default description is project, type and Jira keys', () => {
    const rows = sapCsv.buildRows(activities, period);
    const csv = sapCsv.toCsv(rows, 'E100');
    expect(csv).not.toMatch(/secret-customer-contract|fix login|no project|evil/);
    expect(rows[1].workDescription).toBe('Atlas - Development - ATL-12, ATL-7');
    expect(rows[2].workDescription).toBe('General - Development');
  });

  test('applies per-row description edits', () => {
    const rows = sapCsv.buildRows(activities, { ...period, descriptions: { '2026-10-05|Atlas': 'Sprint 42 work' } });
    expect(rows[1].workDescription).toBe('Sprint 42 work');
  });

  test('escapes formula injection and quotes', () => {
    expect(sapCsv.textCell('=1+1')).toBe(`"'=1+1"`);
    expect(sapCsv.textCell('+cmd')).toBe(`"'+cmd"`);
    expect(sapCsv.textCell('-2')).toBe(`"'-2"`);
    expect(sapCsv.textCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(sapCsv.textCell('\tx')).toBe(`"'\tx"`);
    expect(sapCsv.textCell('say "hi"')).toBe('"say ""hi"""');
    expect(sapCsv.textCell(undefined)).toBe('""');
  });

  test('golden file: current column layout, quoting and line endings', () => {
    const rows = sapCsv.buildRows(activities, period);
    expect(sapCsv.toCsv(rows, 'E100')).toBe([
      'Employee ID,Date,Project,Activity Type,Hours,SAP Code,Cost Center,WBS Element,Work Description,Billable',
      '"E100",2026-10-05,"\'=HYPERLINK(""http://x"")","Development",0.25,"","","","\'=HYPERLINK(""http://x"") - Development",No',
      '"E100",2026-10-05,"Atlas","Development",1.50,"S1","CC1","W1","Atlas - Development - ATL-12, ATL-7",Yes',
      '"E100",2026-10-06,"General","Development",2.00,"","","","General - Development",Yes'
    ].join('\n'));
  });

  describe('request validation', () => {
    const valid = { startDate: '2026-10-05T00:00:00.000Z', endDate: '2026-10-11T23:59:59.000Z', employeeId: ' E100 ' };

    test('accepts a valid request and normalises it', () => {
      const req = sapCsv.validateRequest({ ...valid, descriptions: { '2026-10-05|Atlas': 'line\nbreak' } }, { requireEmployeeId: true });
      expect(req.employeeId).toBe('E100');
      expect(req.descriptions['2026-10-05|Atlas']).toBe('line break');
    });

    test.each([
      ['non-object', null],
      ['missing start', { ...valid, startDate: undefined }],
      ['bad date', { ...valid, endDate: 'tomorrow' }],
      ['end before start', { ...valid, startDate: valid.endDate, endDate: valid.startDate }],
      ['range too long', { ...valid, endDate: '2028-01-01T00:00:00.000Z' }],
      ['employee id type', { ...valid, employeeId: 42 }],
      ['employee id control chars', { ...valid, employeeId: 'E1\u0007' }],
      ['descriptions array', { ...valid, descriptions: [] }],
      ['bad row key', { ...valid, descriptions: { nope: 'x' } }],
      ['description too long', { ...valid, descriptions: { '2026-10-05|Atlas': 'x'.repeat(501) } }]
    ])('rejects %s', (_name, request) => {
      expect(() => sapCsv.validateRequest(request)).toThrow(sapCsv.SapExportValidationError);
    });

    test('requires an employee ID for export', () => {
      expect(() => sapCsv.validateRequest({ ...valid, employeeId: '' }, { requireEmployeeId: true }))
        .toThrow('employeeId is required');
    });

    test('ignores renderer-supplied rows', () => {
      const req = sapCsv.validateRequest({ ...valid, data: [{ project: 'Injected', hours: 99 }] });
      expect(req).not.toHaveProperty('data');
    });
  });
});
