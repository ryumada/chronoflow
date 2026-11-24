/**
 * @file tasks.test.mjs
 * @description Unit tests for task lifecycle, deletion, priority, and reporting logic
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/tasks.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, createMockElement, registerElement, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const {
    addTask,
    startTask,
    playTask,
    pauseTask,
    stopTask,
    deleteTask,
    performDelete,
    changeTaskPriority,
    createTasksReportString,
    generateTasksReport,
    copyTasksToClipboard
} = await import('../src/js/tasks.js');
const { state } = await import('../src/js/state.js');

test.beforeEach(() => {
    resetMockEnv();
    state.tasks = [];
    state.history = [];
    state.activeTaskId = null;
    state.pendingDeleteId = null;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0);
    state.timerRefreshRate = 60000;
});

test('addTask ignores blank titles, unshifts new tasks, clears input, and persists', () => {
    document.getElementById('newTaskInput').value = '   ';
    addTask('   ');
    assert.equal(state.tasks.length, 0);

    document.getElementById('newTaskInput').value = 'First Task';
    addTask('First Task');
    addTask('Urgent Task', 'high');

    assert.equal(state.tasks.length, 2);
    assert.equal(state.tasks[0].title, 'Urgent Task');
    assert.equal(state.tasks[0].priority, 'high');
    assert.equal(state.tasks[1].title, 'First Task');
    assert.equal(state.tasks[1].priority, 'medium');
    assert.equal(document.getElementById('newTaskInput').value, '');
    assert.equal(JSON.parse(localStorage.getItem('chrono_tasks')).length, 2);
});

test('startTask and playTask start timers, pause previously active task, and handle invalid IDs', () => {
    state.tasks = [
        { id: 't1', title: 'Task 1', priority: 'medium', timeLog: [], journal: [] },
        { id: 't2', title: 'Task 2', priority: 'high', timeLog: [], journal: [] }
    ];

    // playTask with invalid ID does not mutate activeTaskId or timeLogs
    playTask('missing');
    assert.equal(state.activeTaskId, null);

    // startTask with invalid ID exits before modifying any timeLog
    startTask('missing');
    assert.equal(state.tasks[0].timeLog.length, 0);
    assert.equal(state.tasks[1].timeLog.length, 0);
    state.activeTaskId = null;

    // startTask on t1
    startTask('t1');
    assert.equal(state.activeTaskId, 't1');
    assert.equal(state.tasks[0].timeLog.length, 1);
    assert.equal(state.tasks[0].timeLog[0].end, null);

    // Calling startTask on already active task is a no-op
    startTask('t1');
    assert.equal(state.tasks[0].timeLog.length, 1);

    // playTask on t2 pauses t1 and starts t2
    playTask('t2');
    assert.equal(state.activeTaskId, 't2');
    assert.notEqual(state.tasks[0].timeLog[0].end, null);
    assert.equal(state.tasks[1].timeLog.length, 1);
    assert.equal(state.tasks[1].timeLog[0].end, null);
    assert.ok(state.tasks[1].timeLog[0].id);
});

test('pauseTask closes open timeLog and updates global UI to paused', () => {
    state.tasks = [
        { id: 't1', title: 'Focus', priority: 'medium', timeLog: [{ start: new Date(Date.now() - 5000).toISOString(), end: null }], journal: [] }
    ];
    state.activeTaskId = 't1';

    pauseTask('missing'); // no-op
    pauseTask('t1');

    assert.notEqual(state.tasks[0].timeLog[0].end, null);
    assert.equal(document.getElementById('globalActionBtn').title, 'Resume');
});

test('stopTask shows errorModal for unstarted tasks and completes started tasks synchronously when not in DOM', () => {
    state.tasks = [
        { id: 'unstarted', title: 'Empty', priority: 'low', timeLog: [], journal: [] },
        { id: 'started', title: 'Running', priority: 'high', timeLog: [{ start: new Date(Date.now() - 10_000).toISOString(), end: null }], journal: [] }
    ];
    state.activeTaskId = 'started';

    stopTask('unknown'); // no-op
    assert.equal(state.tasks.length, 2);

    // Unstarted task triggers error modal
    stopTask('unstarted');
    assert.equal(document.getElementById('errorModal').classList.contains('hidden'), false);
    assert.match(document.getElementById('errorMessage').textContent, /hasn't been started/);
    assert.equal(state.history.length, 0);

    // Started task completes immediately when no animated DOM node exists
    stopTask('started');
    assert.equal(state.tasks.length, 1);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].id, 'started');
    assert.ok(state.history[0].completedAt);
    assert.notEqual(state.history[0].timeLog[0].end, null);
    assert.equal(state.activeTaskId, null);
    assert.equal(document.getElementById('activeTaskTitle').textContent, 'No Task Active');
});

test('stopTask animates slide-out and prevents duplicate completion while in-flight', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    state.tasks = [
        { id: 'anim-1', title: 'Animated', priority: 'medium', timeLog: [{ start: new Date(Date.now() - 60_000).toISOString(), end: null }], journal: [] }
    ];
    state.activeTaskId = 'anim-1';

    const todoItem = createMockElement('div', { className: 'todo-item' });
    const stopBtn = createMockElement('button', { attributes: { onclick: "stopTask('anim-1')" } });
    const menu = createMockElement('div', { id: 'menu-anim-1', className: 'task-menu-dropdown show' });
    todoItem.appendChild(stopBtn);
    todoItem.appendChild(menu);
    registerElement(todoItem);
    registerElement(menu);

    stopTask('anim-1');
    // Duplicate call while completing should be ignored
    stopTask('anim-1');

    assert.equal(stopBtn.disabled, true);
    assert.equal(todoItem.classList.contains('animate-slide-out'), true);
    assert.equal(menu.classList.contains('show'), false);
    assert.equal(state.history.length, 0);

    t.mock.timers.tick(300);

    assert.equal(state.tasks.length, 0);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].id, 'anim-1');
    assert.equal(state.activeTaskId, null);
});

test('deleteTask deletes empty tasks immediately and prompts with specific messages for journal/timeLogs', () => {
    state.tasks = [
        { id: 'empty', title: 'Empty', timeLog: [], journal: [] },
        { id: 'only-j', title: 'Journaled', timeLog: [], journal: [{ id: 'j1', title: 'T', content: 'C' }] },
        { id: 'only-t', title: 'Timed', timeLog: [{ start: '2026-11-24T08:00:00Z', end: '2026-11-24T09:00:00Z' }], journal: [] },
        { id: 'both', title: 'Both', timeLog: [{ start: '2026-11-24T08:00:00Z', end: '2026-11-24T09:00:00Z' }], journal: [{ id: 'j2', title: 'T', content: 'C' }] }
    ];

    deleteTask('missing'); // no-op
    assert.equal(state.tasks.length, 4);

    // Immediate delete when neither journal nor timeLogs exist
    deleteTask('empty');
    assert.equal(state.tasks.find(t => t.id === 'empty'), undefined);
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), true);

    const modalP = document.querySelector('#confirmModal .modal-body p');

    deleteTask('only-j');
    assert.equal(state.pendingDeleteId, 'only-j');
    assert.match(modalP.textContent, /journal entries associated/);
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), false);

    deleteTask('only-t');
    assert.equal(state.pendingDeleteId, 'only-t');
    assert.match(modalP.textContent, /time logs recorded/);

    deleteTask('both');
    assert.equal(state.pendingDeleteId, 'both');
    assert.match(modalP.textContent, /journal entries and time logs/);
});

test('performDelete removes active todo or history item, clears active state, and closes confirm modal', () => {
    state.tasks = [{ id: 'todo-1', title: 'Active Todo', timeLog: [], journal: [] }];
    state.history = [{ id: 'hist-1', title: 'Old History', timeLog: [{ start: '2026-11-24T08:00:00Z', end: '2026-11-24T09:00:00Z' }], journal: [] }];
    state.activeTaskId = 'todo-1';
    state.pendingDeleteId = 'todo-1';
    document.getElementById('confirmModal').classList.remove('hidden');

    performDelete('todo-1');
    assert.equal(state.tasks.length, 0);
    assert.equal(state.activeTaskId, null);
    assert.equal(state.pendingDeleteId, null);
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), true);

    performDelete('hist-1');
    assert.equal(state.history.length, 0);
});

test('changeTaskPriority updates priority and persists, ignoring unknown IDs', () => {
    state.tasks = [{ id: 't1', title: 'Task', priority: 'low', timeLog: [], journal: [] }];
    changeTaskPriority('missing', 'high');
    changeTaskPriority('t1', 'high');
    assert.equal(state.tasks[0].priority, 'high');
    assert.equal(JSON.parse(localStorage.getItem('chrono_tasks'))[0].priority, 'high');
});

test('createTasksReportString, generateTasksReport, and copyTasksToClipboard handle empty, populated, and error paths', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // Empty report
    const emptyReport = createTasksReportString();
    assert.match(emptyReport, /# ChronoFlow Tasks List/);
    assert.match(emptyReport, /No active tasks\./);

    // Populated report with seconds enabled and journal fallback title
    state.timerRefreshRate = 1000;
    state.tasks = [{
        id: 't1',
        title: 'Write Docs',
        priority: 'high',
        timeLog: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T09:30:05.000Z' }],
        journal: [
            { title: 'Progress', content: 'Drafted intro' },
            { title: '', content: 'Untitle note' }
        ]
    }];

    const report = createTasksReportString();
    assert.match(report, /## Tasks \(1 active\)/);
    assert.match(report, /- \*\*\[High\] Write Docs\*\*: 01:30:05/);
    assert.match(report, /- \*Progress\*: Drafted intro/);
    assert.match(report, /- \*Note\*: Untitle note/);

    // generateTasksReport triggers Blob download + revoke
    generateTasksReport();
    assert.equal(mockEnv.createdObjectURLs.length, 1);
    assert.equal(mockEnv.revokedObjectURLs.length, 1);
    assert.equal(mockEnv.revokedObjectURLs[0], mockEnv.createdObjectURLs[0].url);

    // copyTasksToClipboard success swaps button SVG and restores after 2s
    const copyBtn = document.getElementById('copyTasksBtn');
    copyBtn.innerHTML = '<span>Copy</span>';
    copyTasksToClipboard();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(mockEnv.clipboardWrites.length, 1);
    assert.match(copyBtn.innerHTML, /polyline/);
    t.mock.timers.tick(2000);
    assert.equal(copyBtn.innerHTML, '<span>Copy</span>');

    // copyTasksToClipboard error shows alert
    mockEnv.clipboardError = new Error('Denied');
    const origError = console.error;
    console.error = () => {};
    try {
        copyTasksToClipboard();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    } finally {
        console.error = origError;
    }
    assert.ok(mockEnv.alerts.some(msg => msg.includes('Failed to copy tasks')));
});
