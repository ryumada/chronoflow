/**
 * @file persistence.test.mjs
 * @description Unit tests for localStorage loadData and saveData persistence logic
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/persistence.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const { loadData, saveData } = await import('../src/js/persistence.js');
const { state } = await import('../src/js/state.js');

test.beforeEach(() => {
    resetMockEnv();
    state.tasks = [];
    state.history = [];
    state.activeTaskId = null;
    state.sprintStartDay = 0;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0);
    state.timerRefreshRate = 60000;
});

test('loadData restores tasks, history, sprintStartDay, and detects an active running task', () => {
    const runningTask = {
        id: 'task-run',
        title: 'Build Tests',
        priority: 'high',
        timeLog: [{ start: new Date(Date.now() - 60_000).toISOString(), end: null }],
        journal: []
    };
    const completedTask = {
        id: 'hist-1',
        title: 'Done Task',
        timeLog: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T09:00:00.000Z' }]
    };

    localStorage.setItem('chrono_tasks', JSON.stringify([runningTask]));
    localStorage.setItem('chrono_history', JSON.stringify([completedTask]));
    localStorage.setItem('chrono_sprint_start_day', '1');

    loadData();

    assert.equal(state.tasks.length, 1);
    assert.equal(state.history.length, 1);
    assert.equal(state.sprintStartDay, 1);
    assert.equal(state.activeTaskId, 'task-run');
    assert.equal(document.getElementById('activeTaskTitle').textContent, 'Build Tests');
    assert.equal(document.getElementById('activeControls').classList.contains('hidden'), false);
});

test('loadData leaves defaults intact on empty storage and does not activate paused tasks', () => {
    loadData();
    assert.deepEqual(state.tasks, []);
    assert.deepEqual(state.history, []);
    assert.equal(state.activeTaskId, null);

    localStorage.setItem('chrono_tasks', JSON.stringify([
        { id: 't1', title: 'Paused', timeLog: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T08:30:00.000Z' }] },
        { id: 't2', title: 'Idle', timeLog: [] }
    ]));
    loadData();
    assert.equal(state.activeTaskId, null);
});

test('saveData persists tasks/history, respects skipTasks, and renders active history tab view', () => {
    state.tasks = [{ id: 't1', title: 'Task One', priority: 'medium', timeLog: [], journal: [] }];
    state.history = [];

    // Switch active tab to week
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="week"]').classList.add('active');

    saveData(false);

    assert.deepEqual(JSON.parse(localStorage.getItem('chrono_tasks')), state.tasks);
    assert.deepEqual(JSON.parse(localStorage.getItem('chrono_history')), state.history);
    assert.equal(document.getElementById('taskCount').textContent, '1');
    assert.equal(document.getElementById('analyticsChart').classList.contains('hidden'), false);

    // With skipTasks = true, todoList/taskCount should not be re-rendered
    document.getElementById('taskCount').textContent = 'sentinel';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); // no active tab -> defaults to 'day'
    saveData(true);

    assert.equal(document.getElementById('taskCount').textContent, 'sentinel');
    assert.equal(document.getElementById('analyticsChart').classList.contains('hidden'), true);
});
