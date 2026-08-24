/**
 * @file tasks.js
 * @description Core business logic for tasks
 * @requires state, audio, persistence, ui, history, utils
 */
import { state } from './state.js';
import { sounds } from './audio.js';
import { saveData } from './persistence.js';
import { renderTasks, updateGlobalUI, updateTaskDOM, closeErrorModal, closeConfirmModal } from './ui.js';
import { renderHistory } from './history.js';
import { getTaskDuration, formatTime } from './utils.js';

export function addTask(title, priority = 'medium') {
    if (!title.trim()) return;
    const newTask = {
        id: crypto.randomUUID(),
        title: title,
        priority: priority,
        timeLog: [],
        journal: [],
        createdAt: new Date().toISOString()
    };
    state.tasks.unshift(newTask); // Add to top
    saveData();
    document.getElementById('newTaskInput').value = '';
    renderTasks(newTask.id);
}

export function startTask(id) {
    if (state.activeTaskId === id) return;

    if (state.activeTaskId) {
        pauseTask(state.activeTaskId);
    }

    state.activeTaskId = id;
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    task.timeLog.push({ start: new Date().toISOString(), end: null });

    sounds.playStart();
    updateGlobalUI(task, 'running');
    saveData();
    renderTasks();
}

export function playTask(id) {
    if (state.activeTaskId && state.activeTaskId !== id) {
        pauseTask(state.activeTaskId);
    }

    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    task.timeLog.push({
        id: crypto.randomUUID(),
        start: new Date().toISOString(),
        end: null
    });

    state.activeTaskId = id;
    sounds.playStart();
    saveData();
    updateGlobalUI(task, 'running');
    updateTaskDOM(id);
}

export function pauseTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    sounds.playStop();
    saveData();
    updateGlobalUI(task, 'paused');
    updateTaskDOM(id);
}

const completingTaskIds = new Set();

export function stopTask(id) {
    if (completingTaskIds.has(id)) return;

    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = state.tasks[taskIndex];

    if (!task.timeLog || task.timeLog.length === 0) {
        document.getElementById('errorMessage').textContent = "This task hasn't been started. You should start tracking time before completing it.";
        document.getElementById('errorModal').classList.remove('hidden');
        sounds.playError();
        return;
    }

    completingTaskIds.add(id);

    const menu = document.getElementById(`menu-${id}`);
    if (menu) menu.classList.remove('show');

    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    task.completedAt = new Date().toISOString();

    const taskEl = document.querySelector(`.todo-item button[onclick="stopTask('${id}')"]`);
    if (taskEl) {
        taskEl.disabled = true;
    }
    const parentTaskEl = taskEl ? taskEl.closest('.todo-item') : null;

    if (parentTaskEl) {
        parentTaskEl.classList.add('animate-slide-out');
        sounds.playComplete();
        setTimeout(() => {
            try {
                state.tasks = state.tasks.filter(t => t.id !== id);
                if (!state.history.some(t => t.id === id)) {
                    state.history.unshift(task);
                }

                if (state.activeTaskId === id) {
                    state.activeTaskId = null;
                    updateGlobalUI(null, 'idle');
                }

                saveData();
            } finally {
                completingTaskIds.delete(id);
            }
        }, 300);
    } else {
        try {
            state.tasks.splice(taskIndex, 1);
            if (!state.history.some(t => t.id === id)) {
                state.history.unshift(task);
            }

            if (state.activeTaskId === id) {
                state.activeTaskId = null;
                updateGlobalUI(null, 'idle');
            }

            saveData();
        } finally {
            completingTaskIds.delete(id);
        }
    }
}

export function deleteTask(id) {
    const task = state.tasks.find(t => t.id === id) || state.history.find(t => t.id === id);
    if (!task) return;

    const hasJournal = task.journal && task.journal.length > 0;
    const hasTimeLogs = task.timeLog && task.timeLog.length > 0;

    if (hasJournal || hasTimeLogs) {
        sounds.playWarning();
        state.pendingDeleteId = id;

        const modalBody = document.querySelector('#confirmModal .modal-body p');
        if (hasJournal && hasTimeLogs) {
            modalBody.textContent = "This task has journal entries and time logs associated with it.";
        } else if (hasJournal) {
            modalBody.textContent = "This task has journal entries associated with it.";
        } else {
            modalBody.textContent = "This task has time logs recorded.";
        }

        document.getElementById('confirmModal').classList.remove('hidden');
        return;
    }

    performDelete(id);
}

export function changeTaskPriority(id, priority) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.priority = priority;
    saveData();
    renderTasks();
}

export function performDelete(id) {
    if (state.activeTaskId === id) {
        state.activeTaskId = null;
        updateGlobalUI(null, 'idle');
    }

    let isTodo = false;
    if (state.tasks.find(t => t.id === id)) {
        isTodo = true;
        state.tasks = state.tasks.filter(t => t.id !== id);
    } else {
        state.history = state.history.filter(t => t.id !== id);
    }

    if (isTodo) {
        saveData(false);
    } else {
        saveData(true);
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) renderHistory(activeTab.dataset.view);
    }

    sounds.playCleanup();
    closeConfirmModal();
}

export function createTasksReportString() {
    let report = `# ChronoFlow Tasks List\nGenerated: ${new Date().toLocaleString()}\n\n`;

    if (state.tasks.length === 0) {
        return report + "No active tasks.";
    }

    report += `## Tasks (${state.tasks.length} active)\n\n`;

    state.tasks.forEach(task => {
        const priorityStr = task.priority ? `[${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}] ` : '';
        const duration = getTaskDuration(task);
        const durationStr = formatTime(duration, state.timerRefreshRate === 1000);

        report += `- **${priorityStr}${task.title}**: ${durationStr}\n`;
        if (task.journal && task.journal.length > 0) {
            task.journal.forEach(entry => {
                report += `  - *${entry.title || 'Note'}*: ${entry.content}\n`;
            });
        }
    });

    return report;
}

export function generateTasksReport() {
    const report = createTasksReportString();
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ChronoFlow_Tasks_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function copyTasksToClipboard() {
    const report = createTasksReportString();
    navigator.clipboard.writeText(report).then(() => {
        const btn = document.getElementById('copyTasksBtn');
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        // Show Checkmark
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
            btn.innerHTML = originalHtml;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy tasks: ', err);
        alert('Failed to copy tasks to clipboard');
    });
}
