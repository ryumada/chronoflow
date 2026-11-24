/**
 * @file script.test.mjs
 * @description Integration-style unit tests for script.js DOMContentLoaded event wiring, cleanup, settings, import/export, and shortcuts
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../script.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

await import('../script.js');
const { state } = await import('../src/js/state.js');
const { sounds } = await import('../src/js/audio.js');

// Fire DOMContentLoaded once to bind all entry-point listeners
document.dispatchEvent({ type: 'DOMContentLoaded' });
if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
}

test.beforeEach(() => {
    resetMockEnv({ preserveElements: true });
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    state.tasks = [];
    state.history = [];
    state.activeTaskId = null;
    state.sprintStartDay = 0;
    state.timerRefreshRate = 60000;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0);
    document.getElementById('cleanupModal').classList.add('hidden');
    document.getElementById('shortcutsModal').classList.add('hidden');
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('journalModal').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        if (i === 0) b.classList.add('active');
        else b.classList.remove('active');
    });
});

test.afterEach(() => {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
});

test('window.performCleanup deletes all history only when confirmed and prunes records older than N days', () => {
    const now = Date.now();
    const recentIso = new Date(now - 2 * 24 * 3600_000).toISOString();
    const oldIso = new Date(now - 40 * 24 * 3600_000).toISOString();

    state.history = [
        { id: 'recent', title: 'Recent', timeLog: [{ start: recentIso, end: recentIso }] },
        { id: 'old', title: 'Old', timeLog: [{ start: oldIso, end: oldIso }] },
        { id: 'broken', title: 'No Logs', timeLog: [] }
    ];

    const origLog = console.log;
    console.log = () => {};
    try {
        // Cancel 'all' preserves history
        mockEnv.confirmResult = false;
        window.performCleanup('all');
        assert.equal(state.history.length, 3);

        // Numeric days cutoff (30 days) drops 'old' and 'broken', retains 'recent'
        document.getElementById('cleanupModal').classList.remove('hidden');
        window.performCleanup(30);
        assert.equal(state.history.length, 1);
        assert.equal(state.history[0].id, 'recent');
        assert.ok(mockEnv.alerts.some(m => m.includes('Deleted 2 records older than 30 days')));
        assert.equal(document.getElementById('cleanupModal').classList.contains('hidden'), true);

        // Confirm 'all' wipes remaining history
        mockEnv.confirmResult = true;
        window.performCleanup('all');
        assert.equal(state.history.length, 0);
        assert.ok(mockEnv.alerts.some(m => m.includes('All history deleted')));
    } finally {
        console.log = origLog;
    }
});

test('window modal helpers close cleanup and shortcuts modals', () => {
    document.getElementById('cleanupModal').classList.remove('hidden');
    window.closeCleanupModal();
    assert.equal(document.getElementById('cleanupModal').classList.contains('hidden'), true);

    document.getElementById('shortcutsModal').classList.remove('hidden');
    window.closeShortcutsModal();
    assert.equal(document.getElementById('shortcutsModal').classList.contains('hidden'), true);
});

test('settings handlers and Zen mode update volume, sprintStartDay, timerRefreshRate, and body class', async () => {
    const zenBtn = document.getElementById('zenModeBtn');
    zenBtn.click();
    assert.equal(document.body.classList.contains('zen-mode'), true);
    zenBtn.click();
    assert.equal(document.body.classList.contains('zen-mode'), false);

    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.value = '80';
    volumeSlider.dispatchEvent({ type: 'input', target: volumeSlider });
    assert.equal(document.getElementById('volumeValue').textContent, '80%');
    assert.equal(sounds.masterVolume, 0.8);

    // Sprint start select
    const sprintSelect = document.getElementById('sprintStartSelect');
    sprintSelect.value = '1';
    sprintSelect.dispatchEvent({ type: 'change', target: sprintSelect });
    assert.equal(state.sprintStartDay, 1);
    assert.equal(localStorage.getItem('chrono_sprint_start_day'), '1');

    // Refresh rate select (uses dynamic import of ui.js)
    const refreshSelect = document.getElementById('refreshRateSelect');
    refreshSelect.value = '1000';
    refreshSelect.dispatchEvent({ type: 'change', target: refreshSelect });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.timerRefreshRate, 1000);
    assert.equal(localStorage.getItem('chrono_refresh_rate'), '1000');
});

test('JSON export downloads backup and JSON import validates schema, errors, and confirmation', () => {
    state.tasks = [{ id: 't1', title: 'Backup Me', timeLog: [] }];
    state.history = [];

    document.getElementById('exportBtn').click();
    assert.equal(mockEnv.createdObjectURLs.length, 1);
    assert.equal(mockEnv.revokedObjectURLs.length, 1);

    const importInput = document.getElementById('importInput');

    // Valid import confirmed
    mockEnv.confirmResult = true;
    const validPayload = JSON.stringify({ tasks: [{ id: 'imp-1', title: 'Imported', timeLog: [] }], history: [] });
    importInput.dispatchEvent({ type: 'change', target: { files: [{ content: validPayload }], value: 'f.json' } });
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].id, 'imp-1');
    assert.ok(mockEnv.alerts.some(m => m.includes('Data imported successfully')));

    // Invalid schema alerts
    importInput.dispatchEvent({ type: 'change', target: { files: [{ content: JSON.stringify({ wrong: true }) }], value: 'bad.json' } });
    assert.ok(mockEnv.alerts.some(m => m.includes('Invalid file format')));

    // Malformed JSON alerts
    const origError = console.error;
    console.error = () => {};
    try {
        importInput.dispatchEvent({ type: 'change', target: { files: [{ content: '{not json' }], value: 'err.json' } });
    } finally {
        console.error = origError;
    }
    assert.ok(mockEnv.alerts.some(m => m.includes('Error parsing JSON file')));
});

test('global keyboard shortcuts handle Shift+?, Escape (in & out of input), and Space', () => {
    // Shift + ? opens shortcuts modal
    window.dispatchEvent({ type: 'keydown', key: '?', shiftKey: true, target: document.body });
    assert.equal(document.getElementById('shortcutsModal').classList.contains('hidden'), false);

    // Escape closes open modals
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('cleanupModal').classList.remove('hidden');
    window.dispatchEvent({ type: 'keydown', key: 'Escape', target: document.body });
    assert.equal(document.getElementById('shortcutsModal').classList.contains('hidden'), true);
    assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), true);
    assert.equal(document.getElementById('cleanupModal').classList.contains('hidden'), true);

    // Escape inside INPUT blurs input and closes journal modal
    const input = document.getElementById('newTaskInput');
    input.focus();
    document.getElementById('journalModal').classList.remove('hidden');
    window.dispatchEvent({ type: 'keydown', key: 'Escape', target: input });
    assert.equal(input.focused, false);
    assert.equal(document.getElementById('journalModal').classList.contains('hidden'), true);

    // Space starts first task when no active task exists
    state.tasks = [{ id: 'space-1', title: 'Space Task', timeLog: [] }];
    const ev1 = window.dispatchEvent({ type: 'keydown', code: 'Space', target: document.body });
    assert.equal(ev1.defaultPrevented, true);
    assert.equal(state.activeTaskId, 'space-1');

    // Space clicks globalActionBtn when a task is already active (pausing it)
    window.dispatchEvent({ type: 'keydown', code: 'Space', target: document.body });
    assert.notEqual(state.tasks[0].timeLog[0].end, null);
});
