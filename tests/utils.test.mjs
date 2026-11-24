/**
 * @file utils.test.mjs
 * @description Unit tests for time and date utility functions
 * @requires node:test, node:assert/strict, ../src/js/utils.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTaskDuration, formatTime, formatDate } from '../src/js/utils.js';

test('getTaskDuration returns 0 for an empty timeLog', () => {
    assert.equal(getTaskDuration({ timeLog: [] }), 0);
});

test('getTaskDuration sums single and multiple completed time logs accurately', () => {
    const base = Date.UTC(2026, 10, 24, 9, 0, 0);
    const task = {
        timeLog: [
            { start: new Date(base).toISOString(), end: new Date(base + 30 * 60_000).toISOString() },
            { start: new Date(base + 60 * 60_000).toISOString(), end: new Date(base + 105 * 60_000).toISOString() }
        ]
    };

    assert.equal(getTaskDuration(task), 75 * 60_000);
});

test('getTaskDuration computes elapsed time for an active log with end === null', () => {
    const startMs = Date.now() - 5000;
    const task = {
        timeLog: [{ start: new Date(startMs).toISOString(), end: null }]
    };

    const duration = getTaskDuration(task);
    assert.ok(duration >= 4900 && duration <= 6500, `Expected ~5000ms, got ${duration}`);
});

test('formatTime formats zero, sub-second, standard, and >99h durations with and without seconds', () => {
    assert.equal(formatTime(0), '00:00:00');
    assert.equal(formatTime(0, false), '00:00');
    assert.equal(formatTime(999), '00:00:00');
    assert.equal(formatTime(3661_000), '01:01:01');
    assert.equal(formatTime(3661_000, false), '01:01');
    assert.equal(formatTime(100 * 3600_000 + 5 * 60_000 + 9_000), '100:05:09');
    assert.equal(formatTime(100 * 3600_000 + 5 * 60_000 + 9_000, false), '100:05');
});

test('formatDate formats Date objects and ISO strings with zero-padding and optional time', () => {
    const localDate = new Date(2026, 0, 5, 8, 4, 9); // Jan 5, 2026 08:04:09 local time
    assert.equal(formatDate(localDate), '2026-01-05 08:04:09');
    assert.equal(formatDate(localDate, false), '2026-01-05');

    const iso = localDate.toISOString();
    assert.equal(formatDate(iso, true), '2026-01-05 08:04:09');
    assert.equal(formatDate(iso, false), '2026-01-05');
});
