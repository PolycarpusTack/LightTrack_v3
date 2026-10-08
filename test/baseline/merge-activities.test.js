/**
 * #39: merging activities on the timeline happens in main, in one store write.
 */
const { mergeActivities } = require('../../src/main/core/merge-activities');

const at = (h, m = 0) => new Date(2026, 9, 8, h, m).toISOString();

const activities = () => [
  { id: 'c', project: 'Atlas', app: 'Code', startTime: at(14), endTime: at(15), duration: 3600, tags: ['dev'], tickets: ['ATL-2'] },
  { id: 'x', project: 'Other', app: 'Mail', startTime: at(12), endTime: at(12, 30), duration: 1800 },
  { id: 'b', project: 'Atlas', app: 'Code', startTime: at(11), endTime: at(11, 30), duration: 1800, tags: ['review'], tickets: ['ATL-1'] },
  { id: 'a', project: 'Atlas', app: 'Code', startTime: at(9), endTime: at(10), duration: 3600, tags: ['dev'], isManual: false },
  { id: 'y', project: 'Atlas', app: 'Code', startTime: new Date(2026, 9, 9, 9).toISOString(), endTime: new Date(2026, 9, 9, 10).toISOString(), duration: 3600 }
];

describe('merging activities', () => {
  test('keeps the earliest activity, widened to the latest end with summed time', () => {
    const { merged, activities: after } = mergeActivities(activities(), ['c', 'a', 'b']);
    expect(merged).toMatchObject({
      id: 'a', startTime: at(9), endTime: at(15), duration: 9000, actualDuration: 9000, isManual: false,
      tags: ['dev', 'review'], tickets: ['ATL-2', 'ATL-1']
    });
    expect(after.map(a => a.id)).toEqual(['x', 'a', 'y']);
    expect(after[1]).toBe(merged);
  });

  test('refuses different projects', () => {
    expect(() => mergeActivities(activities(), ['a', 'x'])).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
  });

  test('refuses different days', () => {
    expect(() => mergeActivities(activities(), ['a', 'y'])).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
  });

  test('refuses unknown ids and changes nothing', () => {
    const list = activities();
    expect(() => mergeActivities(list, ['a', 'gone'])).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(list).toHaveLength(5);
  });

  test('needs two distinct activities', () => {
    expect(() => mergeActivities(activities(), ['a', 'a'])).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });
});
