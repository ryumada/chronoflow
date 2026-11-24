/**
 * @file ui.test.mjs
 * @description Unit tests for UI rendering, global ticker, inline title editing, and modal workflows
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/ui.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, createMockElement, registerElement, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const {
    renderTasks,
    updateTaskDOM,
    updateGlobalUI,
    startGlobalTicker,
    closeErrorModal,
    closeConfirmModal,
    toggleTaskMenu,
    editTaskTitle,
    openManualTimeModal,
    closeManualTimeModal,
    addManualTime,
    openChunkTimeModal,
    closeChunkTimeModal,
    chunkTaskTime
} = await import('../src/js/ui.js');
const { state } = await import('../src/js/state.js');

test.beforeEach(() => {
    resetMockEnv();
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    state.tasks = [];
    state.history = [];
    state.activeTaskId = null;
    state.pendingDeleteId = null;
    state.currentManualTimeTaskId = null;
    state.currentChunkTaskId = null;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0);
    state.timerRefreshRate = 60000;
});

test.afterEach(() => {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
});

test('renderTasks shows empty state, sorts stably by priority, applies active classes, and exposes window hooks', () => {
    renderTasks();
    assert.equal(document.getElementById('taskCount').textContent, '0');
    assert.match(document.getElementById('todoList').innerHTML, /No active tasks\./);

    state.tasks = [
        { id: 'low-1', title: 'Low First', priority: 'low', timeLog: [] },
        { id: 'med-1', title: 'Med First', priority: 'medium', timeLog: [{ start: new Date().toISOString(), end: null }] },
        { id: 'high-1', title: 'High First', priority: 'high', timeLog: [] },
        { id: 'high-2', title: 'High Second', priority: 'high', timeLog: [] },
        { id: 'med-2', title: 'Med Second', timeLog: [] }
    ];
    state.activeTaskId = 'med-1';

    renderTasks();
    assert.equal(document.getElementById('taskCount').textContent, '5');

    const rendered = document.getElementById('todoList').children;
    assert.equal(rendered.length, 5);
    assert.match(rendered[0].innerHTML, /High First/);
    assert.match(rendered[1].innerHTML, /High Second/);
    assert.match(rendered[2].innerHTML, /Med First/);
    assert.match(rendered[3].innerHTML, /Med Second/);
    assert.match(rendered[4].innerHTML, /Low First/);

    // Active running task receives active-running class
    assert.equal(rendered[2].classList.contains('active-running'), true);

    // Paused active task receives active-paused class
    state.tasks[1].timeLog[0].end = new Date().toISOString();
    renderTasks();
    assert.equal(document.getElementById('todoList').children[2].classList.contains('active-paused'), true);

    assert.equal(typeof window.playTask, 'function');
    assert.equal(typeof window.chunkTaskTime, 'function');
});

test('updateTaskDOM toggles active classes and swaps play/pause button HTML', () => {
    state.tasks = [
        { id: 't1', title: 'Task 1', timeLog: [{ start: new Date().toISOString(), end: null }] }
    ];
    state.activeTaskId = 't1';

    const todoItem = createMockElement('div', { className: 'todo-item' });
    const durationEl = createMockElement('span', { className: 'todo-duration', dataset: { taskId: 't1' } });
    const actions = createMockElement('div', { className: 'todo-actions' });
    const playBtn = createMockElement('button', { className: 'btn btn-icon btn-action-play', title: 'Play' });
    actions.appendChild(playBtn);
    todoItem.appendChild(durationEl);
    todoItem.appendChild(actions);
    registerElement(todoItem);

    // Running state -> active-running + pause button
    updateTaskDOM('t1');
    assert.equal(todoItem.classList.contains('active-running'), true);
    assert.equal(todoItem.classList.contains('active-paused'), false);
    assert.ok(actions.querySelector('.btn-action-pause'));

    // Paused state -> active-paused + play button
    state.tasks[0].timeLog[0].end = new Date().toISOString();
    updateTaskDOM('t1');
    assert.equal(todoItem.classList.contains('active-paused'), true);
    assert.equal(todoItem.classList.contains('active-running'), false);
    assert.ok(actions.querySelector('.btn-action-play'));

    // Inactive state -> neither class
    state.activeTaskId = null;
    updateTaskDOM('t1');
    assert.equal(todoItem.classList.contains('active-running'), false);
    assert.equal(todoItem.classList.contains('active-paused'), false);
});

test('updateGlobalUI updates header, timer, controls, and document.title for idle, running, and paused', () => {
    const task = {
        id: 't1',
        title: 'Deep Work',
        timeLog: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T09:05:10.000Z' }]
    };

    state.timerRefreshRate = 1000;
    updateGlobalUI(task, 'running');
    assert.equal(document.getElementById('activeTaskTitle').textContent, 'Deep Work');
    assert.equal(document.getElementById('activeControls').classList.contains('hidden'), false);
    assert.equal(document.getElementById('globalActionBtn').title, 'Pause');
    assert.equal(document.getElementById('globalTimer').textContent, '01:05:10');
    assert.equal(document.title, '▶ 01:05:10 - Deep Work');

    updateGlobalUI(task, 'paused');
    assert.equal(document.getElementById('globalActionBtn').title, 'Resume');
    assert.equal(document.title, '❚❚ Deep Work');

    updateGlobalUI(null, 'idle');
    assert.equal(document.getElementById('activeTaskTitle').textContent, 'No Task Active');
    assert.equal(document.getElementById('globalTimer').textContent, '00:00:00');
    assert.equal(document.getElementById('activeControls').classList.contains('hidden'), true);
    assert.equal(document.title, 'ChronoFlow');
});

test('startGlobalTicker updates globalTimer, document.title, and active todo-duration on tick', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });

    state.timerRefreshRate = 1000;
    state.tasks = [{
        id: 'tick-1',
        title: 'Live Task',
        timeLog: [{ start: new Date(Date.now() - 65_000).toISOString(), end: null }]
    }];
    state.activeTaskId = 'tick-1';

    const durEl = createMockElement('span', { className: 'todo-duration', dataset: { taskId: 'tick-1' } });
    registerElement(durEl);

    startGlobalTicker();
    const firstInterval = state.timerInterval;
    // Re-invoking clears previous interval
    startGlobalTicker();
    assert.notEqual(state.timerInterval, firstInterval);

    t.mock.timers.tick(1000);
    assert.match(document.getElementById('globalTimer').textContent, /^\d{2}:\d{2}:\d{2}$/);
    assert.match(document.title, /^▶ \d{2}:\d{2}:\d{2} - Live Task$/);
    assert.equal(durEl.textContent, document.getElementById('globalTimer').textContent);
});

test('closeErrorModal, closeConfirmModal, toggleTaskMenu, and outside-click listener behave correctly', () => {
    document.getElementById('errorModal').classList.remove('hidden');
    closeErrorModal();
    assert.equal(document.getElementById('errorModal').classList.contains('hidden'), true);

    state.pendingDeleteId = 't1';
    document.getElementById('confirmModal').classList.remove('hidden');
    closeConfirmModal();
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), true);
    assert.equal(state.pendingDeleteId, null);

    const container1 = createMockElement('div', { className: 'task-menu-container' });
    const menu1 = createMockElement('div', { id: 'menu-t1', className: 'task-menu-dropdown show' });
    const menu2 = createMockElement('div', { id: 'menu-t2', className: 'task-menu-dropdown' });
    container1.appendChild(menu1);
    registerElement(container1);
    registerElement(menu1);
    registerElement(menu2);

    let stopped = false;
    toggleTaskMenu({ stopPropagation() { stopped = true; } }, 't2');
    assert.equal(stopped, true);
    assert.equal(menu1.classList.contains('show'), false);
    assert.equal(menu2.classList.contains('show'), true);

    // Outside click dismisses open menu
    const outside = createMockElement('div');
    document.dispatchEvent({ type: 'click', target: outside });
    assert.equal(menu2.classList.contains('show'), false);
});

test('editTaskTitle edits inline, saves trimmed text on Ctrl+Enter/blur, and reverts blank titles', () => {
    state.tasks = [{ id: 't1', title: 'Original Name', timeLog: [] }];
    state.activeTaskId = 't1';

    const titleEl = createMockElement('div', { className: 'todo-title', dataset: { taskId: 't1' }, textContent: 'Original Name' });
    const menu = createMockElement('div', { id: 'menu-t1', className: 'task-menu-dropdown show' });
    registerElement(titleEl);
    registerElement(menu);

    editTaskTitle('t1');
    assert.equal(menu.classList.contains('show'), false);
    assert.equal(titleEl.children.length, 1);

    const textarea = titleEl.children[0];
    assert.equal(textarea.tagName, 'TEXTAREA');
    assert.equal(textarea.focused, true);

    // Blank submission reverts to existing title
    textarea.value = '   ';
    textarea.blur();
    assert.equal(state.tasks[0].title, 'Original Name');
    assert.equal(titleEl.textContent, 'Original Name');

    // Valid edit via Ctrl+Enter saves and updates active global title
    editTaskTitle('t1');
    const textarea2 = titleEl.children[0];
    textarea2.value = '  Renamed Task  ';
    textarea2.onkeydown({ key: 'Enter', ctrlKey: true });
    assert.equal(state.tasks[0].title, 'Renamed Task');
    assert.equal(titleEl.innerText, 'Renamed Task');
    assert.equal(document.getElementById('activeTaskTitle').textContent, 'Renamed Task');
});

test('manual time modal opens, validates inputs, appends manual log, and closes cleanly', () => {
    state.tasks = [{ id: 't1', title: 'Research', timeLog: [] }];
    const durEl = createMockElement('span', { className: 'todo-duration', dataset: { taskId: 't1' } });
    registerElement(durEl);

    openManualTimeModal('t1');
    assert.equal(state.currentManualTimeTaskId, 't1');
    assert.equal(document.getElementById('manualTimeModal').classList.contains('hidden'), false);
    assert.equal(document.getElementById('manualTimeModalTitle').textContent, 'Add Time to: Research');

    // Zero duration triggers alert
    document.getElementById('manualHoursInput').value = '0';
    document.getElementById('manualMinutesInput').value = '0';
    addManualTime();
    assert.ok(mockEnv.alerts.some(m => m.includes('valid duration')));
    assert.equal(state.tasks[0].timeLog.length, 0);

    // Negative duration triggers alert
    document.getElementById('manualHoursInput').value = '-1';
    addManualTime();
    assert.ok(mockEnv.alerts.some(m => m.includes('cannot be negative')));

    // Valid duration adds manual log of 1h 30m and closes modal
    document.getElementById('manualHoursInput').value = '1';
    document.getElementById('manualMinutesInput').value = '30';
    addManualTime();

    assert.equal(state.tasks[0].timeLog.length, 1);
    assert.equal(state.tasks[0].timeLog[0].manual, true);
    const loggedMs = new Date(state.tasks[0].timeLog[0].end) - new Date(state.tasks[0].timeLog[0].start);
    assert.equal(loggedMs, 90 * 60_000);
    assert.equal(state.currentManualTimeTaskId, null);
    assert.equal(document.getElementById('manualTimeModal').classList.contains('hidden'), true);

    closeManualTimeModal();
    assert.equal(state.currentManualTimeTaskId, null);
});

test('chunk time modal guards <1m tasks, opens for eligible tasks, validates negative durations, and chunks time', () => {
    const now = Date.now();
    state.tasks = [
        { id: 'short', title: 'Short', priority: 'low', timeLog: [{ start: new Date(now - 30_000).toISOString(), end: new Date(now).toISOString() }] },
        { id: 'long', title: 'Long Task', priority: 'high', timeLog: [{ start: new Date(now - 60 * 60_000).toISOString(), end: new Date(now).toISOString() }] }
    ];

    // < 1 minute opens error modal
    openChunkTimeModal('short');
    assert.equal(document.getElementById('errorModal').classList.contains('hidden'), false);
    assert.match(document.getElementById('errorMessage').textContent, /at least 1 minute/);
    assert.equal(state.currentChunkTaskId, null);

    // Eligible task opens chunk modal
    openChunkTimeModal('long');
    assert.equal(state.currentChunkTaskId, 'long');
    assert.equal(document.getElementById('chunkTimeModal').classList.contains('hidden'), false);
    assert.equal(document.getElementById('chunkTaskPriority').value, 'high');

    // Negative duration alerts
    document.getElementById('chunkTaskTitleInput').value = 'Split Out';
    document.getElementById('chunkHoursInput').value = '0';
    document.getElementById('chunkMinutesInput').value = '-15';
    chunkTaskTime();
    assert.ok(mockEnv.alerts.some(m => m.includes('cannot be negative')));

    // Exceeding duration alerts with error from chunkTimeFromTask
    document.getElementById('chunkHoursInput').value = '3';
    document.getElementById('chunkMinutesInput').value = '0';
    chunkTaskTime();
    assert.ok(mockEnv.alerts.some(m => m.includes('cannot exceed')));

    // Valid chunk creates new task and closes modal
    document.getElementById('chunkHoursInput').value = '0';
    document.getElementById('chunkMinutesInput').value = '20';
    chunkTaskTime();

    assert.equal(state.tasks.length, 3);
    assert.equal(state.tasks[0].title, 'Split Out');
    assert.equal(state.currentChunkTaskId, null);
    assert.equal(document.getElementById('chunkTimeModal').classList.contains('hidden'), true);

    closeChunkTimeModal();
    assert.equal(state.currentChunkTaskId, null);
});
