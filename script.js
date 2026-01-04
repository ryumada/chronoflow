// ChronoFlow Logic

// State
let tasks = [];
let history = [];
let activeTaskId = null;
let timerInterval = null;
let currentJournalTaskId = null;
let currentViewDate = new Date(); // Anchor for history view
let pendingDeleteId = null;

// DOM Elements
const newTaskInput = document.getElementById('newTaskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const todoList = document.getElementById('todoList');
const historyList = document.getElementById('historyList');
const globalTimerEl = document.getElementById('globalTimer');
const activeTaskTitleEl = document.getElementById('activeTaskTitle');
const activeControls = document.getElementById('activeControls');
const globalPauseBtn = document.getElementById('globalPauseBtn');
const globalResumeBtn = document.getElementById('globalResumeBtn');

const tabBtns = document.querySelectorAll('.tab-btn');
const exportBtn = document.getElementById('exportBtn');
const cleanupBtn = document.getElementById('cleanupBtn');
const taskCountBadge = document.getElementById('taskCount');
const totalTimeStat = document.getElementById('totalTimeStat');
const completedCountStat = document.getElementById('completedCountStat');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const todayBtn = document.getElementById('todayBtn');
const themeToggle = document.getElementById('themeToggle');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

// Init
function init() {
    loadData();
    loadTheme();
    renderTasks();
    renderHistory('day'); // Default view
    startGlobalTicker();
}

// Data Management
function loadData() {
    const sTasks = localStorage.getItem('chrono_tasks');
    const sHistory = localStorage.getItem('chrono_history');
    if (sTasks) tasks = JSON.parse(sTasks);
    if (sHistory) history = JSON.parse(sHistory);

    // Check if any task was left running?
    // In a real app we might handle auto-resume or auto-pause.
    // For now, let's just restore state.
    const runningTask = tasks.find(t => {
        const lastLog = t.timeLog[t.timeLog.length - 1];
        return lastLog && lastLog.end === null;
    });

    if (runningTask) {
        activeTaskId = runningTask.id;
        updateGlobalUI(runningTask, 'running');
    }
}

function saveData() {
    localStorage.setItem('chrono_tasks', JSON.stringify(tasks));
    localStorage.setItem('chrono_history', JSON.stringify(history));
    renderTasks(); // Re-render to show updates
    renderStats();
}

// Theme Management
function loadTheme() {
    const isLight = localStorage.getItem('chrono_theme') === 'light';
    if (isLight) {
        document.body.classList.add('light-mode');
        themeIconSun.classList.remove('hidden');
        themeIconMoon.classList.add('hidden');
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('chrono_theme', isLight ? 'light' : 'dark');

    if (isLight) {
        themeIconSun.classList.remove('hidden');
        themeIconMoon.classList.add('hidden');
    } else {
        themeIconSun.classList.add('hidden');
        themeIconMoon.classList.remove('hidden');
    }
}

// Sound Manager
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }

    playTone(freq, type, duration, startTime = 0, volume = 0.1) {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + startTime);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);
        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playStart() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Use Square wave (retro/game console startup sound) for maximum audibility
        this.playTone(440, 'square', 0.1, 0, 0.1);
        this.playTone(880, 'square', 0.2, 0.1, 0.1);
    }

    playStop() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(400, 'sawtooth', 0.2, 0, 0.1); // Sawtooth is loud
    }

    playComplete() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Triangle waves for chords are pleasant but audible
        this.playTone(523.25, 'triangle', 0.4, 0, 0.2);   // C5
        this.playTone(659.25, 'triangle', 0.4, 0.1, 0.2); // E5
        this.playTone(783.99, 'triangle', 0.6, 0.2, 0.2); // G5
        this.playTone(1046.50, 'triangle', 0.8, 0.3, 0.2);// C6
    }

    playCleanup() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(150, 'square', 0.4, 0, 0.1); // Square is very distinct
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

const sounds = new SoundManager();

// Logic: Tasks
function addTask(title) {
    if (!title.trim()) return;
    const newTask = {
        id: crypto.randomUUID(),
        title: title,
        timeLog: [],
        journal: []
    };
    tasks.unshift(newTask); // Add to top
    saveData();
    newTaskInput.value = '';
}

function startTask(id) {
    if (activeTaskId === id) return;

    // Stop currently active task if any
    if (activeTaskId) {
        pauseTask(activeTaskId);
    }

    activeTaskId = id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Start new log entry
    task.timeLog.push({ start: new Date().toISOString(), end: null });

    sounds.playStart();
    updateGlobalUI(task, 'running');
    saveData();
    renderTasks();
}

function playTask(id) {
    // If another task is running, pause it first
    if (activeTaskId && activeTaskId !== id) {
        pauseTask(activeTaskId);
    }

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Push new interval
    task.timeLog.push({
        id: crypto.randomUUID(),
        start: new Date().toISOString(),
        end: null
    });

    activeTaskId = id;
    sounds.playStart();
    saveData();
    updateGlobalUI(task, 'running');
}

function pauseTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Find running interval
    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    sounds.playStop(); // Added sound call
    // Don't clear activeTaskId immediately so we can show "Paused" state if we want,
    // but typically pause implies no active timer.
    // For the global UI, we might want to keep showing what was just paused.
    // But for logic, the timer stops.

    // We'll keep activeTaskId set to allow 'Resume' from Global Header,
    // but the interval is closed.
    saveData();
    updateGlobalUI(task, 'paused');
}

function stopTask(id) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];

    // Validation: Task must have at least one time log entry
    if (!task.timeLog || task.timeLog.length === 0) {
        document.getElementById('errorMessage').textContent = "This task hasn't been started. You should start tracking time before completing it.";
        document.getElementById('errorModal').classList.remove('hidden');
        return;
    }

    // 1. Close interval if running
    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    // 2. Move to history
    // Animate removal
    const taskEl = document.querySelector(`.todo-item button[onclick="stopTask('${id}')"]`);
    const parentTaskEl = taskEl ? taskEl.closest('.todo-item') : null;

    if (parentTaskEl) {
        parentTaskEl.classList.add('animate-slide-out');
        sounds.playComplete(); // Play success chord
        setTimeout(() => {
            // Perform the actual removal and state updates after animation
            tasks = tasks.filter(t => t.id !== id);
            history.unshift(task); // Add to history

            // 3. Reset Global UI if this was the active task
            if (activeTaskId === id) {
                activeTaskId = null;
                updateGlobalUI(null, 'idle');
            }

            saveData();
            const activeTab = document.querySelector('.tab-btn.active');
            renderHistory(activeTab ? activeTab.dataset.view : 'day');

        }, 300); // Wait for animation
    } else {
        // Fallback: If element not found, remove immediately
        history.unshift(task);
        tasks.splice(taskIndex, 1);

        // 3. Reset Global UI if this was the active task
        if (activeTaskId === id) {
            activeTaskId = null;
            updateGlobalUI(null, 'idle');
        }

        saveData();
        const activeTab = document.querySelector('.tab-btn.active');
        renderHistory(activeTab ? activeTab.dataset.view : 'day');
    }
}

function closeErrorModal() {
    document.getElementById('errorModal').classList.add('hidden');
}

// Helper: Calculate Duration
function getTaskDuration(task) {
    return task.timeLog.reduce((total, log) => {
        const start = new Date(log.start).getTime();
        const end = log.end ? new Date(log.end).getTime() : new Date().getTime();
        return total + (end - start);
    }, 0);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date, includeTime = true) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    if (!includeTime) return `${yyyy}-${mm}-${dd}`;

    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function deleteTask(id) {
    const task = tasks.find(t => t.id === id) || history.find(t => t.id === id);
    if (!task) return;

    const hasJournal = task.journal && task.journal.length > 0;
    const hasTimeLogs = task.timeLog && task.timeLog.length > 0;

    if (hasJournal || hasTimeLogs) {
        // Show Custom Modal
        pendingDeleteId = id;

        // Update modal text dynamically based on what's being deleted
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

    // Direct delete if no journal and no time logs
    performDelete(id);
}

function performDelete(id) {
    // If it's the active one, reset global timer
    if (activeTaskId === id) {
        activeTaskId = null;
        updateGlobalUI(null, 'idle');
    }

    if (tasks.find(t => t.id === id)) {
        tasks = tasks.filter(t => t.id !== id);
    } else {
        history = history.filter(t => t.id !== id);
    }

    saveData();
    // Re-render handled by saveData calling renderTasks/Stats, but if it was in history list we need:
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) renderHistory(activeTab.dataset.view);

    // Close modal if open
    closeConfirmModal();
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    pendingDeleteId = null;
}

// Journal Logic
function addJournal(taskId, title, content) {
    if (!content.trim()) return;

    // Find task in active or history
    let task = tasks.find(t => t.id === taskId) || history.find(t => t.id === taskId);
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
    if (currentJournalTaskId === taskId) {
        renderJournalList(task);
    }
}

function openJournalModal(taskId) {
    currentJournalTaskId = taskId;
    const task = tasks.find(t => t.id === taskId) || history.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('journalModalTitle').textContent = `Journal: ${task.title}`;
    document.getElementById('journalModal').classList.remove('hidden');

    // Clear inputs
    document.getElementById('journalTitleInput').value = '';
    document.getElementById('journalContentInput').value = '';

    renderJournalList(task);

    // Auto-focus title
    setTimeout(() => {
        document.getElementById('journalTitleInput').focus();
    }, 100);
}

function closeJournalModal() {
    document.getElementById('journalModal').classList.add('hidden');
    currentJournalTaskId = null;
}

function renderJournalList(task) {
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

function copyJournalToClipboard() {
    if (!currentJournalTaskId) return;
    const task = tasks.find(t => t.id === currentJournalTaskId) || history.find(t => t.id === currentJournalTaskId);
    if (!task || !task.journal) return;

    // Requested Format:
    // Monday 2026-01-04 15:45:35
    // 📌 Title
    // Content

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

// UI Rendering
function renderTasks() {
    taskCountBadge.textContent = tasks.length;
    todoList.innerHTML = '';

    if (tasks.length === 0) {
        todoList.innerHTML = `<div class="empty-state"><p>No active tasks.</p></div>`;
        return;
    }

    tasks.forEach(task => {
        const el = document.createElement('div');
        el.className = `todo-item`;

        // Determine state
        const isRunning = task.id === activeTaskId && task.timeLog.some(l => l.end === null);
        if (isRunning) el.classList.add('active-running');
        else if (task.id === activeTaskId) el.classList.add('active-paused');

        el.innerHTML = `
            <div class="todo-title">${task.title}</div>
            <div class="todo-duration" data-task-id="${task.id}" style="font-family:monospace; color:var(--text-secondary); margin-right:10px;">
                ${formatTime(getTaskDuration(task))}
            </div>
            <div class="todo-actions">
                ${isRunning
                ? `<button onclick="pauseTask('${task.id}')" class="btn btn-icon btn-action-pause" title="Pause"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg></button>`
                : `<button onclick="playTask('${task.id}')" class="btn btn-icon btn-action-play" title="Play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>`
            }
                <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                </button>
                <button onclick="stopTask('${task.id}')" class="btn btn-icon btn-action-stop" title="Complete & Archive">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button onclick="deleteTask('${task.id}')" class="btn btn-icon btn-action-delete" title="Delete">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        todoList.appendChild(el);
    });

    // Bind functions to window
    window.playTask = playTask;
    window.pauseTask = pauseTask;
    window.stopTask = stopTask;
    window.deleteTask = deleteTask;
    window.openJournalModal = openJournalModal;
}

function updateGlobalUI(task, state) {
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

    if (state === 'running') {
        activeTaskTitleEl.style.color = "var(--accent-primary)";
        globalPauseBtn.classList.remove('hidden');
        globalResumeBtn.classList.add('hidden');
        document.title = `▶ ${formatTime(getTaskDuration(task))} - ${task.title}`;
    } else {
        // Paused
        activeTaskTitleEl.style.color = "var(--accent-warning)";
        globalPauseBtn.classList.add('hidden');
        globalResumeBtn.classList.remove('hidden');
        globalResumeBtn.onclick = () => playTask(task.id);
        document.title = `❚❚ ${task.title}`;
    }
}

function startGlobalTicker() {
    setInterval(() => {
        if (activeTaskId) {
            const task = tasks.find(t => t.id === activeTaskId);
            if (task) {
                // Determine if strictly running
                const isRunning = task.timeLog.some(l => l.end === null);
                if (isRunning) {
                    const durationMs = getTaskDuration(task);
                    const timeStr = formatTime(durationMs);

                    // 1. Update Global Timer
                    globalTimerEl.textContent = timeStr;

                    // 2. Update Document Title
                    document.title = `▶ ${timeStr} - ${task.title}`;

                    // 3. Update specific list item timer if it exists
                    const taskDurationEl = document.querySelector(`.todo-duration[data-task-id="${activeTaskId}"]`);
                    if (taskDurationEl) {
                        taskDurationEl.textContent = timeStr;
                    }
                }
            }
        }
    }, 1000);
}

// History Views
// History Logic
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
    // actually, let's just make Sunday start of week or Monday?
    // standard user request: "Sunday 4th... show 4th to 10th".
    // This implies Week starts on the "Current Day" if it's the start, or traditional week?
    // "Week of 1/4/2026" usually means Sunday-Saturday or Monday-Sunday.
    // Let's stick to Sunday start for simplicity if local locale defaults to it.
    const start = new Date(d.setDate(d.getDate() - d.getDay()));
    start.setHours(0, 0, 0, 0);
    return start;
}

function getEndOfWeek(date) {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

function changePeriod(offset) {
    const view = document.querySelector('.tab-btn.active').dataset.view;
    if (view === 'day') {
        currentViewDate.setDate(currentViewDate.getDate() + offset);
    } else if (view === 'week') {
        currentViewDate.setDate(currentViewDate.getDate() + (offset * 7));
    } else if (view === 'month') {
        currentViewDate.setMonth(currentViewDate.getMonth() + offset);
    } else if (view === 'year') {
        currentViewDate.setFullYear(currentViewDate.getFullYear() + offset);
    }
    renderHistory(view);
}

function renderHistory(view) {
    // Update tabs
    tabBtns.forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    // Calculate Range
    let start, end, label;
    const d = new Date(currentViewDate);

    if (view === 'day') {
        start = new Date(d.setHours(0, 0, 0, 0));
        end = new Date(d.setHours(23, 59, 59, 999));
        label = start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (view === 'week') {
        start = getStartOfWeek(d);
        end = getEndOfWeek(d);
        // Format: "Jan 4 - Jan 10, 2026"
        const sStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const eStr = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        label = `${sStr} - ${eStr}`;
    } else if (view === 'month') {
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (view === 'year') {
        start = new Date(d.getFullYear(), 0, 1);
        end = new Date(d.getFullYear(), 11, 31, 23, 59, 59);
        label = d.getFullYear().toString();
    }

    document.getElementById('historyRangeLabel').textContent = label;

    historyList.innerHTML = '';

    // Filter History Items falling in range
    // We use the END time of the LAST log as the "completion time"
    const filtered = history.filter(task => {
        const lastLog = task.timeLog[task.timeLog.length - 1];
        if (!lastLog) return false;
        const taskDate = new Date(lastLog.end || lastLog.start);
        return taskDate >= start && taskDate <= end;
    });

    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><p>No history for this period.</p></div>`;
    } else {
        // Render simple list, no grouping needed since we filtered by range already?
        // Or grouped by Day if View > Day?
        // User didn't specify grouping within range, but showing them as a list is fine.
        // Let's sort by date descending.
        filtered.sort((a, b) => {
            const da = new Date(a.timeLog[a.timeLog.length - 1].end);
            const db = new Date(b.timeLog[b.timeLog.length - 1].end);
            return db - da;
        });

        filtered.forEach(task => {
            const item = document.createElement('div');
            item.className = 'history-item';

            // Format time for display
            const lastLog = task.timeLog[task.timeLog.length - 1];
            const dateDisplay = formatDate(lastLog.end);

            item.innerHTML = `
                <div style="flex:1;">
                    <div class="history-title">${task.title}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${dateDisplay}</div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    </button>
                    <div class="history-duration">${formatTime(getTaskDuration(task))}</div>
                     <button onclick="deleteTask('${task.id}')" class="btn btn-icon btn-action-delete" title="Delete" style="transform:scale(0.8)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            historyList.appendChild(item);
        });
    }

    renderAnalytics(view, filtered, start, end);
    renderStats();
}

function renderAnalytics(view, data, start, end) {
    const container = document.getElementById('analyticsChart');
    if (view === 'day') {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    // Group data by day/unit
    const map = new Map();
    const labels = [];

    // Generate buckets based on view
    let current = new Date(start);
    const endDt = new Date(end);
    const isYear = view === 'year';

    // Helper to format key
    const getKey = (d) => {
        if (isYear) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return d.toISOString().split('T')[0];
    };

    // Month abbreviations for Year view
    const monthNames = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

    while (current <= endDt) {
        const k = getKey(current);
        if (!map.has(k)) { // Avoid dupes if iterating by day in Year view, ensuring unique months
            map.set(k, 0);
            const label = isYear ? monthNames[current.getMonth()] : current.getDate();
            labels.push({ key: k, label: label });
        }

        if (isYear) {
            current.setMonth(current.getMonth() + 1); // Jump month
        } else {
            current.setDate(current.getDate() + 1); // Jump day
        }
    }

    // Fill buckets
    data.forEach(task => {
        task.timeLog.forEach(log => {
            if (!log.end) return;
            const logDate = new Date(log.start);
            const k = getKey(logDate);
            const duration = new Date(log.end) - logDate;

            // Only add if key exists (within range) - safe check
            // For Year view, we need to be careful if logDate matches the bucket logic
            // Since we generated keys for the range, it should match.
            if (map.has(k)) {
                map.set(k, map.get(k) + duration);
            }
        });
    });

    // Find max for scaling
    const maxVal = Math.max(...map.values()) || 1;

    // Render Bars
    const chart = document.createElement('div');
    chart.className = 'chart-bars';

    labels.forEach(item => {
        const val = map.get(item.key);
        const percent = Math.min((val / maxVal) * 100, 100);
        const barWrap = document.createElement('div');
        barWrap.className = 'bar-wrap';
        // For tooltip, maybe nicer full name?
        barWrap.title = `${item.key}: ${formatTime(val)}`;

        barWrap.innerHTML = `
            <div class="bar" style="height: ${percent}%;"></div>
            <div class="bar-label">${item.label}</div>
        `;
        chart.appendChild(barWrap);
    });

    container.appendChild(chart);

    // Add summary header inside
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '0.5rem';
    header.style.fontSize = '0.85rem';
    header.style.color = 'var(--text-muted)';
    header.textContent = isYear ? "Monthly Activity Distribution" : "Daily Activity Distribution";
    container.insertBefore(header, container.firstChild);
}

function renderStats() {
    let totalMs = history.reduce((acc, t) => acc + getTaskDuration(t), 0);
    totalTimeStat.textContent = formatTime(totalMs);
    completedCountStat.textContent = history.length;
}

// Event Listeners
addTaskBtn.addEventListener('click', () => addTask(newTaskInput.value));
newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(newTaskInput.value) });

globalPauseBtn.addEventListener('click', () => { if (activeTaskId) pauseTask(activeTaskId); });

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Reset date when switching views? Or keep same "DayOf" focus?
        // Usually better to keep focus or reset to today.
        // Let's reset to Today for simplicity when switching modes unless user complains.
        currentViewDate = new Date();
        renderHistory(btn.dataset.view)
    });
});

document.getElementById('prevPeriodBtn').addEventListener('click', () => changePeriod(-1));
document.getElementById('nextPeriodBtn').addEventListener('click', () => changePeriod(1));
todayBtn.addEventListener('click', () => {
    currentViewDate = new Date();
    const activeTab = document.querySelector('.tab-btn.active');
    renderHistory(activeTab ? activeTab.dataset.view : 'day');
});

themeToggle.addEventListener('click', toggleTheme);

exportBtn.addEventListener('click', () => {
    const data = JSON.stringify({ tasks, history }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.setAttribute("href", url);
    el.setAttribute("download", `chrono_flow_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(el);
    el.click();
    el.remove();
    URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
    importInput.click();
});

importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (importedData.tasks && Array.isArray(importedData.tasks) && importedData.history && Array.isArray(importedData.history)) {
                if (confirm("This will replace your current data. Are you sure?")) {
                    tasks = importedData.tasks;
                    history = importedData.history;
                    saveData();
                    renderTasks();
                    const activeTab = document.querySelector('.tab-btn.active');
                    renderHistory(activeTab ? activeTab.dataset.view : 'day');
                    alert("Data imported successfully!");
                }
            } else {
                alert("Invalid file format. Please use a JSON file exported from ChronoFlow.");
            }
        } catch (err) {
            console.error(err);
            alert("Error parsing JSON file.");
        }
    };
    reader.readAsText(file);
    // Reset input so the same file selection triggers change again if needed
    e.target.value = '';
});

function openCleanupModal() {
    document.getElementById('cleanupModal').classList.remove('hidden');
}

function closeCleanupModal() {
    document.getElementById('cleanupModal').classList.add('hidden');
}

function performCleanup(type) {
    try {
        console.log("Cleanup initiated with type:", type);
        let cutoff = new Date();
        let message = "";

        if (String(type) === 'all') {
            if (!window.confirm("Are you sure you want to delete ALL history? This cannot be undone.")) {
                console.log("Cleanup cancelled by user.");
                return;
            }
            history = [];
            message = "All history deleted.";
        } else {
            const days = parseInt(type);
            cutoff.setDate(cutoff.getDate() - days);
            const originalLen = history.length;
            history = history.filter(t => {
                if (!t.timeLog || t.timeLog.length === 0) return false;
                const lastLog = t.timeLog[t.timeLog.length - 1];
                if (!lastLog) return false;
                return new Date(lastLog.end || lastLog.start) > cutoff;
            });
            message = `Deleted ${originalLen - history.length} records older than ${days} days.`;
        }

        saveData();
        const activeTab = document.querySelector('.tab-btn.active');
        renderHistory(activeTab ? activeTab.dataset.view : 'day'); // Safe optional chaining if supported, else checks for null
        sounds.playCleanup();
        alert(message);
        closeCleanupModal();
    } catch (error) {
        console.error("Cleanup error:", error);
        alert("An error occurred: " + error.message);
    }
}

// Expose functions to global scope for HTML onclick handlers
window.closeCleanupModal = closeCleanupModal;
window.performCleanup = performCleanup;

cleanupBtn.addEventListener('click', openCleanupModal);

// Journal Events
document.getElementById('closeJournalBtn').addEventListener('click', closeJournalModal);
document.getElementById('addJournalBtn').addEventListener('click', () => {
    handleJournalSubmit(false);
});

document.getElementById('addJournalAndCloseBtn').addEventListener('click', () => {
    handleJournalSubmit(true);
});

function handleJournalSubmit(shouldClose) {
    if (!currentJournalTaskId) return;
    const title = document.getElementById('journalTitleInput').value;
    const content = document.getElementById('journalContentInput').value;

    if (!content.trim()) return;

    addJournal(currentJournalTaskId, title, content);

    // Clear inputs
    document.getElementById('journalTitleInput').value = '';
    document.getElementById('journalContentInput').value = '';

    if (shouldClose) {
        closeJournalModal();
    }
}

document.getElementById('copyJournalBtn').addEventListener('click', copyJournalToClipboard);
document.getElementById('journalModal').addEventListener('click', (e) => {
    if (e.target.id === 'journalModal') closeJournalModal();
});

// Delete Confirm Events
document.getElementById('cancelDeleteBtn').addEventListener('click', closeConfirmModal);
document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (pendingDeleteId) performDelete(pendingDeleteId);
});
document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirmModal();
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeJournalModal();
        closeConfirmModal();
        closeErrorModal();
        closeCleanupModal();
    }
});

// Run
init();
