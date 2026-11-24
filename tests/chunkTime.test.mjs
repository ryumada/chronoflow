/**
 * @file chunkTime.test.mjs
 * @description Unit tests for task time chunking logic
 * @requires node:test, node:assert, ../src/js/tasks.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser globals for importing ESM modules in Node
globalThis.window = globalThis;
globalThis.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); }
};
globalThis.document = {
    getElementById: () => ({
        textContent: '',
        value: '',
        classList: { add() {}, remove() {} },
        style: {},
        innerHTML: '',
        appendChild() {}
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: '',
        classList: { add() {}, remove() {} },
        innerHTML: '',
        style: {},
        addEventListener() {},
        appendChild() {}
    }),
    addEventListener() {},
    title: 'ChronoFlow'
};
globalThis.AudioContext = class {
    constructor() {
        this.destination = {};
    }
    createGain() {
        return { gain: { value: 0 }, connect() {} };
    }
};

const { splitTimeLogs, chunkTimeFromTask } = await import('../src/js/tasks.js');
const { state } = await import('../src/js/state.js');

const sumLogs = (logs, nowMs) => logs.reduce((sum, l) => {
    const start = new Date(l.start).getTime();
    const end = l.end ? new Date(l.end).getTime() : nowMs;
    return sum + (end - start);
}, 0);

test('splitTimeLogs carves duration from a paused task across multiple logs', () => {
    const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0);
    const logs = [
        { id: '1', start: new Date(nowMs - 3 * 3600_000).toISOString(), end: new Date(nowMs - 2 * 3600_000).toISOString() }, // 1h
        { id: '2', start: new Date(nowMs - 1 * 3600_000).toISOString(), end: new Date(nowMs).toISOString() } // 1h
    ];

    const { remainingLogs, chunkedLogs, wasRunning } = splitTimeLogs(logs, 90 * 60_000, nowMs);

    assert.equal(wasRunning, false);
    assert.equal(sumLogs(chunkedLogs, nowMs), 90 * 60_000);
    assert.equal(sumLogs(remainingLogs, nowMs), 30 * 60_000);
    assert.equal(chunkedLogs.length, 2);
    assert.equal(remainingLogs.length, 1);
});

test('splitTimeLogs keeps running task running while carving from active log', () => {
    const nowMs = Date.UTC(2026, 10, 24, 13, 0, 0);
    const logs = [
        { id: '1', start: new Date(nowMs - 3 * 3600_000).toISOString(), end: null } // 3h running
    ];

    const { remainingLogs, chunkedLogs, wasRunning } = splitTimeLogs(logs, 90 * 60_000, nowMs);

    assert.equal(wasRunning, true);
    assert.equal(sumLogs(chunkedLogs, nowMs), 90 * 60_000);
    assert.equal(sumLogs(remainingLogs, nowMs), 90 * 60_000);
    assert.equal(remainingLogs[remainingLogs.length - 1].end, null);
});

test('chunkTimeFromTask creates a new task and preserves running source task', () => {
    const nowMs = Date.now();
    state.tasks = [{
        id: 'src-1',
        title: 'Original Task',
        priority: 'high',
        timeLog: [{ id: 'l1', start: new Date(nowMs - 2 * 3600_000).toISOString(), end: null }],
        journal: [],
        createdAt: new Date(nowMs - 2 * 3600_000).toISOString()
    }];
    state.history = [];
    state.activeTaskId = 'src-1';

    const res = chunkTimeFromTask('src-1', 'Forgotten New Task', 'medium', 60 * 60_000);
    assert.equal(res.ok, true);
    assert.equal(state.tasks.length, 2);
    assert.equal(res.newTask.title, 'Forgotten New Task');
    assert.equal(res.newTask.priority, 'medium');
    assert.equal(state.activeTaskId, 'src-1');

    const srcTask = state.tasks.find(t => t.id === 'src-1');
    assert.equal(srcTask.timeLog.some(l => l.end === null), true);
});

test('chunkTimeFromTask rejects duration exceeding tracked time or empty title', () => {
    const nowMs = Date.now();
    state.tasks = [{
        id: 'src-2',
        title: 'Short Task',
        priority: 'low',
        timeLog: [{ id: 'l1', start: new Date(nowMs - 30 * 60_000).toISOString(), end: new Date(nowMs).toISOString() }],
        journal: []
    }];

    assert.equal(chunkTimeFromTask('src-2', '   ', 'low', 10 * 60_000).ok, false);
    assert.equal(chunkTimeFromTask('src-2', 'Valid', 'low', 45 * 60_000).ok, false);
    assert.equal(state.tasks.length, 1);
});
