/**
 * @file ui.js
 * @description UI rendering and DOM manipulation
 * @requires state, utils, audio, persistence, tasks, journal
 */
import { state } from './state.js';
import { formatTime, formatDate, getTaskDuration } from './utils.js';
import { sounds } from './audio.js';
import { saveData } from './persistence.js';
import { playTask, pauseTask, stopTask, deleteTask } from './tasks.js';
import { openJournalModal, addJournal } from './journal.js';

export function renderTasks(newTaskId = null) {
    const taskCountBadge = document.getElementById('taskCount');
    const todoList = document.getElementById('todoList');
    taskCountBadge.textContent = state.tasks.length;
    todoList.innerHTML = '';

    if (state.tasks.length === 0) {
        todoList.innerHTML = `<div class="empty-state"><p>No active tasks.</p></div>`;
        return;
    }

    // Sort tasks: high priority first, then medium, then low. Preserve original order within same priority.
    const originalIndex = new Map();
    state.tasks.forEach((task, index) => originalIndex.set(task.id, index));

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedTasks = [...state.tasks].sort((a, b) => {
        const aPriority = priorityOrder[a.priority || 'medium'] ?? 1;
        const bPriority = priorityOrder[b.priority || 'medium'] ?? 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Preserve original order for same priority
        return originalIndex.get(a.id) - originalIndex.get(b.id);
    });

    sortedTasks.forEach(task => {
        const el = document.createElement('div');
        el.className = `todo-item animate-slide-up`;

        el.addEventListener('animationend', () => {
            el.classList.remove('animate-slide-up');
        });

        const isRunning = task.id === state.activeTaskId && task.timeLog.some(l => l.end === null);
        if (isRunning) el.classList.add('active-running');
        else if (task.id === state.activeTaskId) el.classList.add('active-paused');

        const priority = task.priority || 'medium';
        const priorityLabels = { high: 'High', medium: 'Medium', low: 'Low' };
        const priorityLabel = priorityLabels[priority] || 'Medium';

        el.innerHTML = `
            <div style="flex:1;">
                <div class="todo-title" data-task-id="${task.id}" style="white-space: pre-wrap;">${task.title}</div>
                 <div class="todo-meta" style="margin-top:4px;">
                    <span class="priority-badge priority-${priority}">${priorityLabel}</span>
                    <span class="todo-duration" data-task-id="${task.id}" style="font-family:monospace; color:var(--text-secondary); margin-right:10px;">
                        ${formatTime(getTaskDuration(task), state.timerRefreshRate === 1000)}
                    </span>
                    ${task.createdAt ? `<span style="font-size:0.75rem; color:var(--text-muted); display:inline-block;">Created: ${formatDate(task.createdAt)}</span>` : ''}
                </div>
            </div>
            <div class="todo-actions" style="align-self: flex-start; margin-top:2px;">
                ${isRunning
                ? `<button onclick="pauseTask('${task.id}')" class="btn btn-icon btn-action-pause" title="Pause"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg></button>`
                : `<button onclick="playTask('${task.id}')" class="btn btn-icon btn-action-play" title="Play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>`
            }
                <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal" style="position: relative;">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                   ${task.journal && task.journal.length > 0 ? `<span class="journal-badge">${task.journal.length}</span>` : ''}
                </button>

                 <div class="task-menu-container">
                    <button onclick="toggleTaskMenu(event, '${task.id}')" class="btn btn-icon btn-action-menu" title="More Options">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </button>
                    <div id="menu-${task.id}" class="task-menu-dropdown">
                        <button onclick="openManualTimeModal('${task.id}')" class="task-menu-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 8 12 12 16 16"></polyline>
                            </svg>
                            Add Manual Time
                        </button>
                        <button onclick="editTaskTitle('${task.id}')" class="task-menu-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Edit Name
                        </button>
                        <button onclick="stopTask('${task.id}')" class="task-menu-item">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Complete
                        </button>
                        <button onclick="deleteTask('${task.id}')" class="task-menu-item danger">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
        todoList.appendChild(el);
    });

    window.playTask = playTask;
    window.pauseTask = pauseTask;
    window.stopTask = stopTask;
    window.deleteTask = deleteTask;
    window.openJournalModal = openJournalModal;
    window.openManualTimeModal = openManualTimeModal;
    window.toggleTaskMenu = toggleTaskMenu;
    window.editTaskTitle = editTaskTitle;
}

export function updateTaskDOM(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const durationEl = document.querySelector(`.todo-duration[data-task-id="${taskId}"]`);
    if (!durationEl) return;
    const taskEl = durationEl.closest('.todo-item');
    if (!taskEl) return;

    const isRunning = task.id === state.activeTaskId && task.timeLog.some(l => l.end === null);

    if (isRunning) {
        taskEl.classList.add('active-running');
        taskEl.classList.remove('active-paused');
    } else if (task.id === state.activeTaskId) {
        taskEl.classList.add('active-paused');
        taskEl.classList.remove('active-running');
    } else {
        taskEl.classList.remove('active-running');
        taskEl.classList.remove('active-paused');
    }

    const actionContainer = taskEl.querySelector('.todo-actions');
    const btnHtml = isRunning
        ? `<button onclick="pauseTask('${task.id}')" class="btn btn-icon btn-action-pause" title="Pause"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg></button>`
        : `<button onclick="playTask('${task.id}')" class="btn btn-icon btn-action-play" title="Play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>`;

    const oldBtn = actionContainer.querySelector('.btn-action-play, .btn-action-pause');
    if (oldBtn) {
        oldBtn.outerHTML = btnHtml;
    }
}

export function updateGlobalUI(task, status) {
    const activeTaskTitleEl = document.getElementById('activeTaskTitle');
    const globalTimerEl = document.getElementById('globalTimer');
    const activeControls = document.getElementById('activeControls');

    if (!task) {
        activeTaskTitleEl.textContent = "No Task Active";
        activeTaskTitleEl.style.color = "var(--text-primary)";
        globalTimerEl.textContent = "00:00:00";
        activeControls.classList.add('hidden');
        document.title = "ChronoFlow";
        return;
    }

    activeTaskTitleEl.textContent = task.title;
    activeControls.classList.remove('hidden');

    const globalActionBtn = document.getElementById('globalActionBtn');

    if (status === 'running') {
        activeTaskTitleEl.style.color = "var(--accent-primary)";
        globalActionBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        globalActionBtn.title = "Pause";
        globalActionBtn.className = "btn btn-warning btn-icon";
        globalActionBtn.onclick = () => pauseTask(task.id);
        const timeStr = formatTime(getTaskDuration(task), state.timerRefreshRate === 1000);
        document.title = `▶ ${timeStr} - ${task.title}`;
        globalTimerEl.textContent = timeStr;
    } else {
        activeTaskTitleEl.style.color = "var(--accent-warning)";
        globalActionBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        globalActionBtn.title = "Resume";
        globalActionBtn.className = "btn btn-primary btn-icon";
        globalActionBtn.onclick = () => playTask(task.id);
        document.title = `❚❚ ${task.title}`;
        globalTimerEl.textContent = formatTime(getTaskDuration(task), state.timerRefreshRate === 1000);
    }
}

export function startGlobalTicker() {
    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
        if (state.activeTaskId) {
            const task = state.tasks.find(t => t.id === state.activeTaskId);
            if (task) {
                const isRunning = task.timeLog.some(l => l.end === null);
                if (isRunning) {
                    const durationMs = getTaskDuration(task);
                    const showSeconds = state.timerRefreshRate === 1000;
                    const timeStr = formatTime(durationMs, showSeconds);

                    document.getElementById('globalTimer').textContent = timeStr;
                    document.title = `▶ ${timeStr} - ${task.title}`;

                    const taskDurationEl = document.querySelector(`.todo-duration[data-task-id="${state.activeTaskId}"]`);
                    if (taskDurationEl) {
                        taskDurationEl.textContent = timeStr;
                    }
                }
            }
        }
    }, state.timerRefreshRate || 60000);
}

export function closeErrorModal() {
    document.getElementById('errorModal').classList.add('hidden');
}

export function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    state.pendingDeleteId = null;
}

export function toggleTaskMenu(event, taskId) {
    event.stopPropagation();
    document.querySelectorAll('.task-menu-dropdown.show').forEach(el => {
        if (el.id !== `menu-${taskId}`) {
            el.classList.remove('show');
        }
    });

    const menu = document.getElementById(`menu-${taskId}`);
    if (menu) {
        menu.classList.toggle('show');
    }
}

export function editTaskTitle(taskId) {
    const menu = document.getElementById(`menu-${taskId}`);
    if (menu) menu.classList.remove('show');

    const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
    if (!titleEl) return;

    const currentTitle = titleEl.innerText;
    titleEl.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'task-title-input';
    textarea.value = currentTitle;
    textarea.onblur = () => saveTaskTitle(taskId, textarea.value);
    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            textarea.blur();
        }
    };

    titleEl.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function saveTaskTitle(taskId, newTitle) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const trimmed = newTitle.trim();
    if (!trimmed) {
        const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
        if (titleEl) titleEl.textContent = task.title;
        return;
    }

    task.title = trimmed;
    saveData(true);

    const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
    if (titleEl) {
        titleEl.innerText = trimmed;
        titleEl.style.whiteSpace = 'pre-wrap';
    }

    if (state.activeTaskId === taskId) {
        updateGlobalUI(task, 'running');
    }
}

export function openManualTimeModal(taskId) {
    state.currentManualTimeTaskId = taskId;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const menu = document.getElementById(`menu-${taskId}`);
    if (menu) menu.classList.remove('show');

    document.getElementById('manualTimeModalTitle').textContent = `Add Time to: ${task.title}`;
    document.getElementById('manualHoursInput').value = 0;
    document.getElementById('manualMinutesInput').value = 0;
    document.getElementById('manualTimeModal').classList.remove('hidden');
    document.getElementById('manualHoursInput').focus();
}

export function closeManualTimeModal() {
    document.getElementById('manualTimeModal').classList.add('hidden');
    state.currentManualTimeTaskId = null;
}

export function addManualTime() {
    if (!state.currentManualTimeTaskId) return;

    const task = state.tasks.find(t => t.id === state.currentManualTimeTaskId);
    if (!task) return;

    const hours = parseInt(document.getElementById('manualHoursInput').value) || 0;
    const minutes = parseInt(document.getElementById('manualMinutesInput').value) || 0;

    if (hours === 0 && minutes === 0) {
        alert("Please enter a valid duration.");
        return;
    }

    if (hours < 0 || minutes < 0) {
        alert("Duration cannot be negative.");
        return;
    }

    const durationMs = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
    const now = new Date();
    const start = new Date(now.getTime() - durationMs);

    task.timeLog.push({
        id: crypto.randomUUID(),
        start: start.toISOString(),
        end: now.toISOString(),
        manual: true
    });

    saveData();
    const durationEl = document.querySelector(`.todo-duration[data-task-id="${state.currentManualTimeTaskId}"]`);
    if (durationEl) {
        durationEl.textContent = formatTime(getTaskDuration(task), state.timerRefreshRate === 1000);
    }

    sounds.playClick();
    closeManualTimeModal();
}

// Attach outside clicks to menu closer
document.addEventListener('click', (event) => {
    if (!event.target.closest('.task-menu-container')) {
        document.querySelectorAll('.task-menu-dropdown.show').forEach(el => {
            el.classList.remove('show');
        });
    }
});
