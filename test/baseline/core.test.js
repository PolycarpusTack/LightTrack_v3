const fs = require('fs');
const path = require('path');
const TitleParser = require('../../src/main/core/title-parser');
const {
  sanitizeString,
  sanitizeSapCode,
  validateAndSanitizeActivity,
  validateAndSanitizeProject
} = require('../../src/shared/sanitize');

describe('supported v3 baseline', () => {
  test('sanitizes captured text and SAP codes', () => {
    expect(sanitizeString('<b>Customer</b>\u0000 work')).toBe('Customer work');
    expect(sanitizeSapCode('  WBS-100<script>  ')).toBe('WBS-100script');
  });

  test('validates activity and project import boundaries', () => {
    const activity = validateAndSanitizeActivity({
      title: '<em>Review</em>',
      project: 'Client A',
      duration: 900,
      startTime: '2026-10-05T09:00:00.000Z'
    });
    const project = validateAndSanitizeProject({
      name: 'Client A',
      sapCode: 'SAP-100',
      costCenter: 'CC-10',
      wbsElement: 'WBS-42'
    });

    expect(activity).toMatchObject({ valid: true, sanitized: { title: 'Review' } });
    expect(project).toMatchObject({ valid: true, sanitized: { sapCode: 'SAP-100' } });
  });

  test('extracts Jira evidence without claiming unsupported context', () => {
    const parser = new TitleParser({
      store: { get: jest.fn((_key, fallback) => fallback) }
    });

    const result = parser.parse({
      owner: { name: 'Visual Studio Code' },
      title: 'LT-123 implement export validation - LightTrack'
    });

    expect(result.tickets).toContain('LT-123');
    expect(result.tags).toContain('jira');
    expect(result.url).toBeNull();
  });

  test('keeps the active BrowserWindow sandboxed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/main/core/window-manager.js'),
      'utf8'
    );

    expect(source).toContain('contextIsolation: true');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('sandbox: true');
  });
});
