const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));

const {
  EMPTY_JOB,
  formatHistoryDateHeader,
  formatJobClockTime,
  groupHistoryJobs,
} = createLoader()('src/features/jobs/jobData.ts');

test('formatJobClockTime returns local 24h HH:mm and null for missing or invalid timestamps', () => {
  const sample = new Date(2026, 10, 27, 8, 5).toISOString();
  assert.equal(formatJobClockTime(sample), '08:05');

  const afternoon = new Date(2026, 10, 27, 14, 12).toISOString();
  assert.equal(formatJobClockTime(afternoon), '14:12');

  assert.equal(formatJobClockTime(undefined), null);
  assert.equal(formatJobClockTime(''), null);
  assert.equal(formatJobClockTime('not-a-date'), null);
});

test('formatHistoryDateHeader formats Today, Yesterday, same-year, cross-year, and missing dates in EN and VI', () => {
  const now = new Date(2026, 10, 27, 15, 0);
  const todayIso = new Date(2026, 10, 27, 9, 30).toISOString();
  const yesterdayIso = new Date(2026, 10, 26, 18, 45).toISOString();
  const earlierThisYearIso = new Date(2026, 10, 17, 10, 0).toISOString();
  const lastYearIso = new Date(2025, 11, 31, 22, 15).toISOString();

  assert.equal(formatHistoryDateHeader(todayIso, now, 'en'), 'Today · 27 Nov');
  assert.equal(formatHistoryDateHeader(todayIso, now, 'vi'), 'Hôm nay · 27 Thg 11');

  assert.equal(formatHistoryDateHeader(yesterdayIso, now, 'en'), 'Yesterday · 26 Nov');
  assert.equal(formatHistoryDateHeader(yesterdayIso, now, 'vi'), 'Hôm qua · 26 Thg 11');

  assert.equal(formatHistoryDateHeader(earlierThisYearIso, now, 'en'), '17 Nov');
  assert.equal(formatHistoryDateHeader(earlierThisYearIso, now, 'vi'), '17 Thg 11');

  assert.equal(formatHistoryDateHeader(lastYearIso, now, 'en'), '31 Dec 2025');
  assert.equal(formatHistoryDateHeader(lastYearIso, now, 'vi'), '31 Thg 12, 2025');

  assert.equal(formatHistoryDateHeader(undefined, now, 'en'), 'Earlier');
  assert.equal(formatHistoryDateHeader('invalid', now, 'vi'), 'Trước đó');
});

test('groupHistoryJobs sorts newest-first by completedAt/createdAtUtc and keeps invalid timestamps under Earlier', () => {
  const now = new Date(2026, 10, 27, 15, 0);
  const makeJob = (id, overrides = {}) => ({
    ...EMPTY_JOB,
    id,
    jobNo: id,
    status: 'COMPLETED',
    ...overrides,
  });

  const jobs = [
    makeJob('job-older', {
      completedAt: new Date(2026, 10, 17, 11, 20).toISOString(),
      createdAtUtc: new Date(2026, 10, 17, 11, 0).toISOString(),
    }),
    makeJob('job-no-ts', {
      completedAt: undefined,
      createdAtUtc: '',
    }),
    makeJob('job-today-early', {
      completedAt: undefined,
      createdAtUtc: new Date(2026, 10, 27, 8, 15).toISOString(),
    }),
    makeJob('job-today-late', {
      completedAt: new Date(2026, 10, 27, 14, 5).toISOString(),
      createdAtUtc: new Date(2026, 10, 27, 13, 50).toISOString(),
    }),
  ];

  const rows = groupHistoryJobs(jobs, now, 'vi');
  assert.deepEqual(
    plain(rows.map((row) => (row.type === 'date' ? `DATE:${row.label}` : `JOB:${row.job.id}`))),
    [
      'DATE:Hôm nay · 27 Thg 11',
      'JOB:job-today-late',
      'JOB:job-today-early',
      'DATE:17 Thg 11',
      'JOB:job-older',
      'DATE:Trước đó',
      'JOB:job-no-ts',
    ],
  );
});
