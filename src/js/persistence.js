/**
 * @file persistence.js
 * @description Data persistence functions (load/save)
 * @requires state, ui, history
 */
import { state } from './state.js';
import { updateGlobalUI, renderTasks } from './ui.js';
import { renderHistory } from './history.js';

export function loadData() {
    const sTasks = localStorage.getItem('chrono_tasks');
    const sHistory = localStorage.getItem('chrono_history');
    const sSprintStart = localStorage.getItem('chrono_sprint_start_day');

    if (sTasks) state.tasks = JSON.parse(sTasks);
    if (sHistory) state.history = JSON.parse(sHistory);
    if (sSprintStart) state.sprintStartDay = parseInt(sSprintStart);

    const runningTask = state.tasks.find(t => {
        const lastLog = t.timeLog[t.timeLog.length - 1];
        return lastLog && lastLog.end === null;
    });

    if (runningTask) {
        state.activeTaskId = runningTask.id;
        updateGlobalUI(runningTask, 'running');
    }
}

export function saveData(skipTasks = false) {
    localStorage.setItem('chrono_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('chrono_history', JSON.stringify(state.history));
    if (!skipTasks) renderTasks(); // Re-render to show updates

    // Check if there's an active tab for history, otherwise default to day
    const activeTab = document.querySelector('.tab-btn.active');
    renderHistory(activeTab ? activeTab.dataset.view : 'day');
}
