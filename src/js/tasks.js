/**
 * @file tasks.js
 * @description Core business logic for tasks
 * @requires state, audio, persistence, ui, history
 */
import { state } from './state.js';
import { sounds } from './audio.js';
import { saveData } from './persistence.js';
import { renderTasks, updateGlobalUI, updateTaskDOM, closeErrorModal, closeConfirmModal } from './ui.js';
import { renderHistory } from './history.js';

export function addTask(title) {
    if (!title.trim()) return;
    const newTask = {
        id: crypto.randomUUID(),
        title: title,
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

export function stopTask(id) {
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = state.tasks[taskIndex];

    if (!task.timeLog || task.timeLog.length === 0) {
        document.getElementById('errorMessage').textContent = "This task hasn't been started. You should start tracking time before completing it.";
        document.getElementById('errorModal').classList.remove('hidden');
        sounds.playError();
        return;
    }

    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    task.completedAt = new Date().toISOString();

    const taskEl = document.querySelector(`.todo-item button[onclick="stopTask('${id}')"]`);
    const parentTaskEl = taskEl ? taskEl.closest('.todo-item') : null;

    if (parentTaskEl) {
        parentTaskEl.classList.add('animate-slide-out');
        sounds.playComplete();
        setTimeout(() => {
            state.tasks = state.tasks.filter(t => t.id !== id);
            state.history.unshift(task);

            if (state.activeTaskId === id) {
                state.activeTaskId = null;
                updateGlobalUI(null, 'idle');
            }

            saveData();
        }, 300);
    } else {
        state.history.unshift(task);
        state.tasks.splice(taskIndex, 1);

        if (state.activeTaskId === id) {
            state.activeTaskId = null;
            updateGlobalUI(null, 'idle');
        }

        saveData();
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
