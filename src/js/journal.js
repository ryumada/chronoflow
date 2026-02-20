/**
 * @file journal.js
 * @description Journal management
 * @requires state, persistence, utils
 */
import { state } from './state.js';
import { saveData } from './persistence.js';
import { formatDate } from './utils.js';

export function addJournal(taskId, title, content) {
    if (!content.trim()) return;

    let task = state.tasks.find(t => t.id === taskId) || state.history.find(t => t.id === taskId);
    if (!task) return;

    if (!task.journal) task.journal = [];

    const now = new Date().toISOString();
    task.journal.unshift({
        id: crypto.randomUUID(),
        title: title || 'No Title',
        content: content,
        createdAt: now,
        updatedAt: now
    });

    saveData();
    if (state.currentJournalTaskId === taskId) {
        renderJournalList(task);
    }
    updateJournalBadges(taskId);
}

export function updateJournalBadges(taskId) {
    const task = state.tasks.find(t => t.id === taskId) || state.history.find(t => t.id === taskId);
    if (!task) return;
    const count = task.journal ? task.journal.length : 0;

    document.querySelectorAll(`button[onclick="openJournalModal('${taskId}')"]`).forEach(btn => {
        let badge = btn.querySelector('.journal-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'journal-badge';
                btn.appendChild(badge);
            }
            badge.textContent = count;
        } else {
            if (badge) badge.remove();
        }
    });
}

export function openJournalModal(taskId) {
    state.currentJournalTaskId = taskId;
    const task = state.tasks.find(t => t.id === taskId) || state.history.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('journalModalTitle').textContent = `Journal: ${task.title}`;
    document.getElementById('journalModal').classList.remove('hidden');

    document.getElementById('journalTitleInput').value = '';
    document.getElementById('journalContentInput').value = '';

    renderJournalList(task);

    setTimeout(() => {
        document.getElementById('journalTitleInput').focus();
    }, 100);
}

export function closeJournalModal() {
    document.getElementById('journalModal').classList.add('hidden');
    state.currentJournalTaskId = null;
}

export function renderJournalList(task) {
    const listEl = document.getElementById('journalList');
    listEl.innerHTML = '';

    if (!task.journal || task.journal.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="font-size:0.85rem"><p>No journal entries yet.</p></div>`;
        return;
    }

    task.journal.forEach(entry => {
        const el = document.createElement('div');
        el.className = 'journal-entry';
        const dateStr = formatDate(entry.createdAt);

        el.innerHTML = `
            <div class="journal-meta">
                <span>${dateStr}</span>
            </div>
            <div class="journal-title">${entry.title}</div>
            <div class="journal-content">${entry.content}</div>
        `;
        listEl.appendChild(el);
    });
}

export function copyJournalToClipboard() {
    if (!state.currentJournalTaskId) return;
    const task = state.tasks.find(t => t.id === state.currentJournalTaskId) || state.history.find(t => t.id === state.currentJournalTaskId);
    if (!task || !task.journal) return;

    const text = task.journal.map(entry => {
        const d = new Date(entry.createdAt);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekday = days[d.getDay()];
        const dateStr = `${weekday} ${formatDate(d)}`;

        return `${dateStr}\n📌 ${entry.title}\n${entry.content}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyJournalBtn');
        const originalText = btn.innerHTML;
        btn.textContent = "Copied!";
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
}
