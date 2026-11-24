/**
 * @file journal.test.mjs
 * @description Unit tests for journal creation, badges, modal controls, rendering, and clipboard copy
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/journal.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, createMockElement, registerElement, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const {
    addJournal,
    updateJournalBadges,
    openJournalModal,
    closeJournalModal,
    renderJournalList,
    copyJournalToClipboard
} = await import('../src/js/journal.js');
const { state } = await import('../src/js/state.js');

test.beforeEach(() => {
    resetMockEnv();
    state.tasks = [];
    state.history = [];
    state.currentJournalTaskId = null;
    state.currentViewDate = new Date(2026, 10, 24, 12, 0, 0);
});

test('addJournal ignores blank content or unknown tasks, supports tasks & history, and prepends entries', () => {
    state.tasks = [{ id: 't1', title: 'Active Task', timeLog: [] }];
    state.history = [{ id: 'h1', title: 'Completed Task', timeLog: [{ start: '2026-11-24T08:00:00Z', end: '2026-11-24T09:00:00Z' }], journal: [] }];

    addJournal('t1', 'Title', '   ');
    addJournal('unknown', 'Title', 'Body');
    assert.equal(state.tasks[0].journal, undefined);

    // Initializes missing journal array and defaults empty title to 'No Title'
    addJournal('t1', '', 'First note');
    addJournal('t1', 'Update', 'Second note');
    assert.equal(state.tasks[0].journal.length, 2);
    assert.equal(state.tasks[0].journal[0].title, 'Update');
    assert.equal(state.tasks[0].journal[0].content, 'Second note');
    assert.equal(state.tasks[0].journal[1].title, 'No Title');
    assert.ok(state.tasks[0].journal[0].id);

    // Works on history tasks and re-renders when modal is open for that task
    state.currentJournalTaskId = 'h1';
    addJournal('h1', 'Retro', 'Lessons learned');
    assert.equal(state.history[0].journal.length, 1);
    assert.equal(document.getElementById('journalList').children.length, 1);
    assert.match(document.getElementById('journalList').children[0].innerHTML, /Lessons learned/);
});

test('updateJournalBadges creates, updates, and removes journal-badge elements', () => {
    state.tasks = [{ id: 't1', title: 'Task', timeLog: [], journal: [{ id: '1', title: 'A', content: 'B' }] }];

    const btn = createMockElement('button', { attributes: { onclick: "openJournalModal('t1')" } });
    registerElement(btn);

    updateJournalBadges('missing'); // no-op
    updateJournalBadges('t1');

    let badge = btn.querySelector('.journal-badge');
    assert.ok(badge);
    assert.equal(badge.textContent, '1');

    // Update existing badge count
    state.tasks[0].journal.push({ id: '2', title: 'C', content: 'D' });
    updateJournalBadges('t1');
    assert.equal(btn.querySelector('.journal-badge').textContent, '2');

    // Remove badge when count reaches 0
    state.tasks[0].journal = [];
    updateJournalBadges('t1');
    assert.equal(btn.querySelector('.journal-badge'), null);
});

test('openJournalModal and closeJournalModal toggle modal visibility, focus title input, and reset state', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    state.tasks = [{
        id: 't1',
        title: 'API Integration',
        timeLog: [],
        journal: [{ id: 'j1', title: 'Note 1', content: 'Details', createdAt: '2026-11-24T10:00:00.000Z' }]
    }];

    // Missing task is a no-op
    openJournalModal('missing');
    assert.equal(document.getElementById('journalModal').classList.contains('hidden'), true);

    document.getElementById('journalTitleInput').value = 'old';
    document.getElementById('journalContentInput').value = 'old';

    openJournalModal('t1');
    assert.equal(state.currentJournalTaskId, 't1');
    assert.equal(document.getElementById('journalModalTitle').textContent, 'Journal: API Integration');
    assert.equal(document.getElementById('journalModal').classList.contains('hidden'), false);
    assert.equal(document.getElementById('journalTitleInput').value, '');
    assert.equal(document.getElementById('journalContentInput').value, '');
    assert.equal(document.getElementById('journalList').children.length, 1);

    t.mock.timers.tick(100);
    assert.equal(document.getElementById('journalTitleInput').focused, true);

    closeJournalModal();
    assert.equal(document.getElementById('journalModal').classList.contains('hidden'), true);
    assert.equal(state.currentJournalTaskId, null);
});

test('renderJournalList displays empty state when no entries exist and renders entries when present', () => {
    renderJournalList({ id: 't1', journal: [] });
    assert.match(document.getElementById('journalList').innerHTML, /No journal entries yet\./);

    renderJournalList({
        id: 't1',
        journal: [
            { title: 'Design', content: 'Finalized schema', createdAt: new Date(2026, 10, 24, 9, 15, 0).toISOString() }
        ]
    });
    const children = document.getElementById('journalList').children;
    assert.equal(children.length, 1);
    assert.equal(children[0].className, 'journal-entry');
    assert.match(children[0].innerHTML, /Design/);
    assert.match(children[0].innerHTML, /Finalized schema/);
    assert.match(children[0].innerHTML, /2026-11-24 09:15:00/);
});

test('copyJournalToClipboard formats entries with weekday and restores button label after timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // No-op when no active journal task
    copyJournalToClipboard();
    assert.equal(mockEnv.clipboardWrites.length, 0);

    const entryDate = new Date(2026, 10, 24, 14, 30, 0); // Tuesday
    state.tasks = [{
        id: 't1',
        title: 'Task',
        timeLog: [],
        journal: [
            { title: 'Standup', content: 'Completed tests', createdAt: entryDate.toISOString() },
            { title: 'Plan', content: 'Reviewed modules', createdAt: entryDate.toISOString() }
        ]
    }];
    state.currentJournalTaskId = 't1';

    const copyBtn = document.getElementById('copyJournalBtn');
    copyBtn.innerHTML = '<span>Copy All</span>';

    copyJournalToClipboard();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(mockEnv.clipboardWrites.length, 1);
    assert.equal(
        mockEnv.clipboardWrites[0],
        'Tuesday 2026-11-24 14:30:00\n📌 Standup\nCompleted tests\n\nTuesday 2026-11-24 14:30:00\n📌 Plan\nReviewed modules'
    );
    assert.equal(copyBtn.textContent, 'Copied!');

    t.mock.timers.tick(2000);
    assert.equal(copyBtn.innerHTML, '<span>Copy All</span>');
});
