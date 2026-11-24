/**
 * @file history.test.mjs
 * @description Unit tests for history date ranges, period navigation, rendering, analytics, stats, and reports
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/history.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const {
    getStartOfWeek,
    getEndOfWeek,
    getDateRange,
    changePeriod,
    renderHistory,
    renderAnalytics,
    renderStats,
    createReportString,
    generateReport,
    copyReportToClipboard
} = await import('../src/js/history.js');
const { state } = await import('../src/js/state.js');

test.beforeEach(() => {
    resetMockEnv();
    state.tasks = [];
    state.history = [];
    state.sprintStartDay = 0;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0); // Tue Nov 24, 2026
    state.timerRefreshRate = 60000;
});

test('getStartOfWeek and getEndOfWeek respect sprintStartDay including wrap-around', () => {
    const tue = new Date(2026, 10, 24, 15, 30, 0); // Tuesday (day = 2)

    // Sunday start (0) -> Sun Nov 22 to Sat Nov 28
    state.sprintStartDay = 0;
    const sunStart = getStartOfWeek(tue);
    const sunEnd = getEndOfWeek(tue);
    assert.equal(sunStart.getFullYear(), 2026);
    assert.equal(sunStart.getMonth(), 10);
    assert.equal(sunStart.getDate(), 22);
    assert.equal(sunStart.getHours(), 0);
    assert.equal(sunEnd.getDate(), 28);
    assert.equal(sunEnd.getHours(), 23);
    assert.equal(sunEnd.getMinutes(), 59);

    // Monday start (1) -> Mon Nov 23 to Sun Nov 29
    state.sprintStartDay = 1;
    assert.equal(getStartOfWeek(tue).getDate(), 23);
    assert.equal(getEndOfWeek(tue).getDate(), 29);

    // Wednesday start (3) -> wraps back to Wed Nov 18 to Tue Nov 24
    state.sprintStartDay = 3;
    assert.equal(getStartOfWeek(tue).getDate(), 18);
    assert.equal(getEndOfWeek(tue).getDate(), 24);
});

test('getDateRange computes accurate bounds for day, week, month (leap & non-leap), and year', () => {
    const ref = new Date(2026, 10, 24, 14, 0, 0);

    const dayRange = getDateRange('day', ref);
    assert.equal(dayRange.start.getDate(), 24);
    assert.equal(dayRange.start.getHours(), 0);
    assert.equal(dayRange.end.getDate(), 24);
    assert.equal(dayRange.end.getHours(), 23);
    assert.ok(dayRange.label.length > 0);

    const weekRange = getDateRange('week', ref);
    assert.equal(weekRange.start.getDate(), 22);
    assert.equal(weekRange.end.getDate(), 28);
    assert.match(weekRange.label, / - /);

    // Non-leap February 2026 (28 days)
    const feb2026 = getDateRange('month', new Date(2026, 1, 10));
    assert.equal(feb2026.start.getDate(), 1);
    assert.equal(feb2026.end.getDate(), 28);

    // Leap February 2024 (29 days)
    const feb2024 = getDateRange('month', new Date(2024, 1, 10));
    assert.equal(feb2024.start.getDate(), 1);
    assert.equal(feb2024.end.getDate(), 29);

    const yearRange = getDateRange('year', ref);
    assert.equal(yearRange.start.getMonth(), 0);
    assert.equal(yearRange.start.getDate(), 1);
    assert.equal(yearRange.end.getMonth(), 11);
    assert.equal(yearRange.end.getDate(), 31);
    assert.equal(yearRange.label, '2026');
});

test('changePeriod shifts state.currentViewDate for day, week, month, and year views', () => {
    const activateTab = (view) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
    };

    activateTab('day');
    changePeriod(1);
    assert.equal(state.currentViewDate.getDate(), 25);
    changePeriod(-2);
    assert.equal(state.currentViewDate.getDate(), 23);

    activateTab('week');
    changePeriod(1);
    assert.equal(state.currentViewDate.getDate(), 30);

    state.currentViewDate = new Date(2026, 5, 15, 12, 0, 0); // Jun 15, 2026
    activateTab('month');
    changePeriod(1);
    assert.equal(state.currentViewDate.getMonth(), 6); // Jul
    changePeriod(-2);
    assert.equal(state.currentViewDate.getMonth(), 4); // May

    activateTab('year');
    changePeriod(1);
    assert.equal(state.currentViewDate.getFullYear(), 2027);
});

test('renderHistory filters by range, skips empty timeLogs, sorts newest first, and handles empty state', () => {
    renderHistory('day');
    assert.match(document.getElementById('historyList').innerHTML, /No history for this period\./);

    const earlier = new Date(2026, 10, 24, 9, 0, 0);
    const earlierEnd = new Date(2026, 10, 24, 10, 0, 0);
    const later = new Date(2026, 10, 24, 13, 0, 0);
    const laterEnd = new Date(2026, 10, 24, 15, 0, 0);
    const otherDay = new Date(2026, 10, 20, 10, 0, 0);

    state.history = [
        { id: 'empty-log', title: 'No Logs', timeLog: [] },
        {
            id: 'h-earlier',
            title: 'Morning Work',
            priority: 'low',
            createdAt: earlier.toISOString(),
            completedAt: earlierEnd.toISOString(),
            timeLog: [{ start: earlier.toISOString(), end: earlierEnd.toISOString() }],
            journal: [{ id: 'j1', title: 'N', content: 'C' }]
        },
        {
            id: 'h-later',
            title: 'Afternoon Work',
            priority: 'high',
            timeLog: [{ start: later.toISOString(), end: laterEnd.toISOString() }]
        },
        {
            id: 'h-old',
            title: 'Last Week',
            timeLog: [{ start: otherDay.toISOString(), end: new Date(otherDay.getTime() + 3600_000).toISOString() }]
        }
    ];

    renderHistory('day');

    const items = document.getElementById('historyList').children;
    assert.equal(items.length, 2);
    assert.match(items[0].innerHTML, /Afternoon Work/);
    assert.match(items[1].innerHTML, /Morning Work/);
    assert.match(items[1].innerHTML, /journal-badge/);
    assert.equal(document.getElementById('completedCountStat').textContent, '2');
    assert.equal(document.getElementById('totalTimeStat').textContent, '03:00');
});

test('renderAnalytics hides chart on day view and renders daily/monthly bars for week and year views', () => {
    const chartContainer = document.getElementById('analyticsChart');

    // Day view hides chart
    const dayRange = getDateRange('day', state.currentViewDate);
    renderAnalytics('day', [], dayRange.start, dayRange.end);
    assert.equal(chartContainer.classList.contains('hidden'), true);

    // Week view renders 7 daily bars + header, ignoring open logs
    const weekRange = getDateRange('week', state.currentViewDate);
    const midWeekStart = new Date(2026, 10, 25, 10, 0, 0);
    const midWeekEnd = new Date(2026, 10, 25, 12, 0, 0);
    const sampleData = [{
        id: 'w1',
        timeLog: [
            { start: midWeekStart.toISOString(), end: midWeekEnd.toISOString() },
            { start: midWeekEnd.toISOString(), end: null } // ignored
        ]
    }];

    renderAnalytics('week', sampleData, weekRange.start, weekRange.end);
    assert.equal(chartContainer.classList.contains('hidden'), false);
    assert.equal(chartContainer.children[0].textContent, 'Daily Activity Distribution');
    assert.equal(chartContainer.children[1].children.length, 7);
    assert.ok(chartContainer.children[1].children.some(bar => bar.innerHTML.includes('height: 100%;')));

    // Year view renders 12 monthly bars (JAN..DEC)
    const yearRange = getDateRange('year', state.currentViewDate);
    renderAnalytics('year', sampleData, yearRange.start, yearRange.end);
    assert.equal(chartContainer.children[0].textContent, 'Monthly Activity Distribution');
    const yearBars = chartContainer.children[1].children;
    assert.equal(yearBars.length, 12);
    assert.match(yearBars[0].innerHTML, /JAN/);
    assert.match(yearBars[11].innerHTML, /DEC/);
});

test('renderStats computes stats from passed data or falls back to state.history', () => {
    state.timerRefreshRate = 1000;
    state.history = [{
        id: 'h1',
        timeLog: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T08:01:05.000Z' }]
    }];

    renderStats();
    assert.equal(document.getElementById('totalTimeStat').textContent, '00:01:05');
    assert.equal(document.getElementById('completedCountStat').textContent, '1');

    renderStats([]);
    assert.equal(document.getElementById('totalTimeStat').textContent, '00:00:00');
    assert.equal(document.getElementById('completedCountStat').textContent, '0');
});

test('createReportString, generateReport, and copyReportToClipboard format reports and handle errors', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // Empty period
    const emptyReport = createReportString();
    assert.match(emptyReport, /# ChronoFlow Report/);
    assert.match(emptyReport, /No tasks found for this period\./);

    // Multi-day week report
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="week"]').classList.add('active');

    const day1Start = new Date(2026, 10, 23, 9, 0, 0);
    const day1End = new Date(2026, 10, 23, 10, 0, 0);
    const day2Start = new Date(2026, 10, 24, 9, 0, 0);
    const day2End = new Date(2026, 10, 24, 11, 30, 0);

    state.history = [
        {
            id: 'h1',
            title: 'Monday Task',
            timeLog: [{ start: day1Start.toISOString(), end: day1End.toISOString() }],
            journal: [{ title: '', content: 'Wrapped up API' }]
        },
        {
            id: 'h2',
            title: 'Tuesday Task',
            timeLog: [{ start: day2Start.toISOString(), end: day2End.toISOString() }],
            journal: [{ title: 'Note', content: 'Verified locally' }]
        }
    ];

    const report = createReportString();
    assert.match(report, /- \*\*Tuesday Task\*\*: 02:30/);
    assert.match(report, /- \*\*Monday Task\*\*: 01:00/);
    assert.match(report, /- \*Note\*: Wrapped up API/);
    assert.match(report, /\*\*Daily Total\*\*: 02:30/);
    // Newer day (Tuesday) appears before older day (Monday)
    assert.ok(report.indexOf('Tuesday Task') < report.indexOf('Monday Task'));

    // generateReport downloads and revokes URL
    generateReport();
    assert.equal(mockEnv.createdObjectURLs.length, 1);
    assert.equal(mockEnv.revokedObjectURLs.length, 1);

    // copyReportToClipboard success
    const copyBtn = document.getElementById('copyReportBtn');
    copyBtn.innerHTML = '<span>Copy Report</span>';
    copyReportToClipboard();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(mockEnv.clipboardWrites.length, 1);
    assert.match(copyBtn.innerHTML, /polyline/);
    t.mock.timers.tick(2000);
    assert.equal(copyBtn.innerHTML, '<span>Copy Report</span>');

    // copyReportToClipboard error
    mockEnv.clipboardError = new Error('No permission');
    const origError = console.error;
    console.error = () => {};
    try {
        copyReportToClipboard();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    } finally {
        console.error = origError;
    }
    assert.ok(mockEnv.alerts.some(m => m.includes('Failed to copy report')));
});
