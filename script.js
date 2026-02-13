// ChronoFlow Logic

// State
let tasks = [];
let history = [];
let activeTaskId = null;
let timerInterval = null;
let currentJournalTaskId = null;
let currentViewDate = new Date(); // Anchor for history view
let pendingDeleteId = null;
let currentManualTimeTaskId = null; // Track which task to add time to
let sprintStartDay = 0; // 0=Sunday, default

// DOM Elements
const newTaskInput = document.getElementById('newTaskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const todoList = document.getElementById('todoList');
const historyList = document.getElementById('historyList');
const globalTimerEl = document.getElementById('globalTimer');
const activeTaskTitleEl = document.getElementById('activeTaskTitle');
const activeControls = document.getElementById('activeControls');

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
    const sSprintStart = localStorage.getItem('chrono_sprint_start_day');

    if (sTasks) tasks = JSON.parse(sTasks);
    if (sHistory) history = JSON.parse(sHistory);
    if (sSprintStart) sprintStartDay = parseInt(sSprintStart);

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

function saveData(skipTasks = false) {
    localStorage.setItem('chrono_tasks', JSON.stringify(tasks));
    localStorage.setItem('chrono_history', JSON.stringify(history));
    if (!skipTasks) renderTasks(); // Re-render to show updates
    renderHistory('day'); // Re-render History
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
        this.masterVolume = parseFloat(localStorage.getItem('chrono_volume')) || 0.5; // Default 50%

        // Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.ctx.destination);
    }

    setVolume(value) {
        let vol = Math.max(0, Math.min(1, value));
        this.masterVolume = vol;
        this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
        localStorage.setItem('chrono_volume', vol);
    }

    playTone(freq, type, duration, startTime = 0, volume = 0.1, endFreq = null) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.enabled) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.value = freq;
        if (endFreq) {
            osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + startTime + duration);
        }
        osc.type = type;

        osc.connect(gain);
        gain.connect(this.masterGain); // Route to Master Gain

        osc.start(this.ctx.currentTime + startTime);

        // Envelope
        gain.gain.setValueAtTime(0, this.ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playStart() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Use Square wave (retro/game console startup sound) for maximum audibility
        this.playTone(440, 'square', 0.15, 0, 0.1);
        this.playTone(880, 'square', 0.4, 0.1, 0.1);
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

    playClick() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Very short, high "tick" for general feedback
        this.playTone(600, 'sine', 0.05, 0, 0.05);
    }

    playCleanup() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(150, 'square', 0.4, 0, 0.1); // Square is very distinct
    }

    playWarning() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Two low square "alert" pulses
        this.playTone(220, 'square', 0.1, 0, 0.15); // A3
        this.playTone(165, 'square', 0.2, 0.12, 0.15); // E3 (roughly)
    }

    playError() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(150, 'sawtooth', 0.3, 0, 0.15, 100);
    }

    playSega() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.enabled) return;

        const now = this.ctx.currentTime;

        // 1. SE Sound (User specified)
        // 1. SE Sound (G4 Lead + Bass support)
        const playSE = (t) => {
            const freqs = [130.81, 196.00, 261.63, 392.00]; // C3, G3, C4, G4
            const duration = 0.8;

            freqs.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.frequency.value = f;
                osc.type = 'sawtooth';
                osc.detune.value = (i - 2) * 8; // Spread detune

                osc.connect(gain);
                gain.connect(this.masterGain); // Route to MASTER

                osc.start(t);

                gain.gain.setValueAtTime(0, t);
                // Bass notes get slightly more amplitude
                const noteVol = i < 2 ? 0.08 : 0.06; // Reduce gain
                gain.gain.linearRampToValueAtTime(noteVol, t + 0.1);
                gain.gain.setValueAtTime(noteVol, t + 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

                osc.stop(t + duration);
            });
        };

        // 2. GA Sound (E3 Lead + Deep Bass support)
        const playGA = (t) => {
            const freqs = [65.41, 98.00, 130.81, 164.81]; // C2, G2, C3, E3
            const duration = 1.0;
            const vol = 0.08; // Reduced from 0.15 to prevent clipping

            freqs.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.frequency.value = f;
                osc.type = 'sawtooth';
                osc.detune.value = (i % 2 === 0 ? 1 : -1) * 8; // Alternating detune

                osc.connect(gain);
                gain.connect(this.masterGain); // Route to MASTER

                osc.start(t);

                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(vol, t + 0.05); // Fast attack
                gain.gain.setValueAtTime(vol, t + duration * 0.7);
                gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

                osc.stop(t + duration);
            });
        };

        // Sequence them
        playSE(now);
        playGA(now + 0.50); // Overlap slightly for seamless chant
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
        journal: [],
        createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask); // Add to top
    saveData();
    newTaskInput.value = '';
    renderTasks(newTask.id);
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
    updateTaskDOM(id);
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
    updateTaskDOM(id);
}
function stopTask(id) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];

    // Validation: Task must have at least one time log entry
    if (!task.timeLog || task.timeLog.length === 0) {
        document.getElementById('errorMessage').textContent = "This task hasn't been started. You should start tracking time before completing it.";
        document.getElementById('errorModal').classList.remove('hidden');
        sounds.playError();
        return;
    }

    // 1. Close interval if running
    const activeLog = task.timeLog.find(l => l.end === null);
    if (activeLog) {
        activeLog.end = new Date().toISOString();
    }

    // Set completion time
    task.completedAt = new Date().toISOString();

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
        // Play Warning Sound
        sounds.playWarning();

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

    let isTodo = false;
    if (tasks.find(t => t.id === id)) {
        isTodo = true;
        tasks = tasks.filter(t => t.id !== id);
    } else {
        history = history.filter(t => t.id !== id);
    }

    if (isTodo) {
        saveData(false); // Re-render Task List
    } else {
        saveData(true); // Skip Task List re-render
        // Re-render History if visible
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) renderHistory(activeTab.dataset.view);
    }

    sounds.playCleanup();

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
function renderTasks(newTaskId = null) {
    taskCountBadge.textContent = tasks.length;
    todoList.innerHTML = '';

    if (tasks.length === 0) {
        todoList.innerHTML = `<div class="empty-state"><p>No active tasks.</p></div>`;
        return;
    }

    tasks.forEach(task => {
        const el = document.createElement('div');
        el.className = `todo-item animate-slide-up`;

        // Remove animation class after it finishes so it doesn't re-trigger
        el.addEventListener('animationend', () => {
            el.classList.remove('animate-slide-up');
        });

        // Determine state
        const isRunning = task.id === activeTaskId && task.timeLog.some(l => l.end === null);
        if (isRunning) el.classList.add('active-running');
        else if (task.id === activeTaskId) el.classList.add('active-paused');

        el.innerHTML = `
            <div style="flex:1;">
                <div class="todo-title" data-task-id="${task.id}">${task.title}</div>
                 <div class="todo-meta" style="margin-top:4px;">
                    <span class="todo-duration" data-task-id="${task.id}" style="font-family:monospace; color:var(--text-secondary); margin-right:10px;">
                        ${formatTime(getTaskDuration(task))}
                    </span>
                    ${task.createdAt ? `<span style="font-size:0.75rem; color:var(--text-muted); display:inline-block;">Created: ${formatDate(task.createdAt)}</span>` : ''}
                </div>
            </div>
            <div class="todo-actions" style="align-self: flex-start; margin-top:2px;">
                ${isRunning
                ? `<button onclick="pauseTask('${task.id}')" class="btn btn-icon btn-action-pause" title="Pause"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg></button>`
                : `<button onclick="playTask('${task.id}')" class="btn btn-icon btn-action-play" title="Play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>`
            }
                <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                </button>

                <!-- Menu Button -->
                 <div class="task-menu-container">
                    <button onclick="toggleTaskMenu(event, '${task.id}')" class="btn btn-icon btn-action-menu" title="More Options">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </button>
                    <!-- Dropdown -->
                    <div id="menu-${task.id}" class="task-menu-dropdown">
                        <!-- Menu Items -->
                        <button onclick="openManualTimeModal('${task.id}')" class="task-menu-item">
                            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="14" cy="14" r="12"></circle>
                                <polyline points="14 8 14 14 18 16"></polyline>
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

    // Bind functions to window
    window.playTask = playTask;
    window.pauseTask = pauseTask;
    window.stopTask = stopTask;
    window.deleteTask = deleteTask;
    window.openJournalModal = openJournalModal;
    window.openManualTimeModal = openManualTimeModal;
    window.toggleTaskMenu = toggleTaskMenu;
    window.editTaskTitle = editTaskTitle;
}

function updateTaskDOM(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Find Element
    // We didn't set IDs on the items, so traverse or match by some attribute.
    // We put data-task-id on duration, so we can find parent.
    const durationEl = document.querySelector(`.todo-duration[data-task-id="${taskId}"]`);
    if (!durationEl) return;
    const taskEl = durationEl.closest('.todo-item');
    if (!taskEl) return;

    // Determine state
    const isRunning = task.id === activeTaskId && task.timeLog.some(l => l.end === null);

    // Update Classes
    if (isRunning) {
        taskEl.classList.add('active-running');
        taskEl.classList.remove('active-paused');
    } else if (task.id === activeTaskId) {
        taskEl.classList.add('active-paused');
        taskEl.classList.remove('active-running');
    } else {
        taskEl.classList.remove('active-running');
        taskEl.classList.remove('active-paused');
    }

    // Update Button
    const actionContainer = taskEl.querySelector('.todo-actions');
    // The first button is Play/Pause.
    // We can just reconstruct the Play/Pause button string or safely replace first child if it matches specific class.
    // Simpler: Re-render the first button
    const btnHtml = isRunning
        ? `<button onclick="pauseTask('${task.id}')" class="btn btn-icon btn-action-pause" title="Pause"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg></button>`
        : `<button onclick="playTask('${task.id}')" class="btn btn-icon btn-action-play" title="Play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>`;

    const oldBtn = actionContainer.querySelector('.btn-action-play, .btn-action-pause');
    if (oldBtn) {
        oldBtn.outerHTML = btnHtml;
    }
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

    const globalActionBtn = document.getElementById('globalActionBtn');

    if (state === 'running') {
        activeTaskTitleEl.style.color = "var(--accent-primary)";
        globalActionBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        globalActionBtn.title = "Pause";
        globalActionBtn.className = "btn btn-warning btn-icon";
        globalActionBtn.onclick = () => pauseTask(task.id);
        document.title = `▶ ${formatTime(getTaskDuration(task))} - ${task.title}`;
    } else {
        // Paused
        activeTaskTitleEl.style.color = "var(--accent-warning)";
        globalActionBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        globalActionBtn.title = "Resume";
        globalActionBtn.className = "btn btn-primary btn-icon";
        globalActionBtn.onclick = () => playTask(task.id);
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
    // Calculate difference based on configured start day (0-6)
    const targetDay = sprintStartDay;

    // Logic:
    // If current day is 3 (Wed) and target is 1 (Mon), diff is 2.
    // If current day is 0 (Sun) and target is 1 (Mon), diff should be 6 (previous Mon).
    let diff = day - targetDay;
    if (diff < 0) diff += 7;

    const start = new Date(d.setDate(d.getDate() - diff));
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

function getDateRange(view, referenceDate) {
    let start, end, label;
    const d = new Date(referenceDate);

    if (view === 'day') {
        start = new Date(d.setHours(0, 0, 0, 0));
        end = new Date(d.setHours(23, 59, 59, 999));
        label = start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (view === 'week') {
        start = getStartOfWeek(d);
        end = getEndOfWeek(d);
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
    return { start, end, label };
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
    const { start, end, label } = getDateRange(view, currentViewDate);

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
            const getEndTime = (task) => {
                if (task.completedAt) return new Date(task.completedAt).getTime();
                const lastLog = task.timeLog[task.timeLog.length - 1];
                return lastLog ? new Date(lastLog.end || lastLog.start).getTime() : 0;
            };
            return getEndTime(b) - getEndTime(a);
        });

        filtered.forEach(task => {
            const item = document.createElement('div');
            item.className = 'history-item';

            // Format time for display
            const lastLog = task.timeLog[task.timeLog.length - 1];

            // Determine display strings
            const createdStr = task.createdAt ? formatDate(task.createdAt) : '';
            const completedDate = task.completedAt || (lastLog ? lastLog.end : null);
            const completedStr = completedDate ? formatDate(completedDate) : 'Unknown';

            let dateDisplay = '';
            if (createdStr) {
                dateDisplay = `Created: ${createdStr} <br> Completed: ${completedStr}`; // Newline separator
            } else {
                dateDisplay = `Completed: ${completedStr}`;
            }

            item.innerHTML = `
                <div style="flex:1;">
                    <div class="history-title">${task.title}</div>
                    <div style="margin-top:4px;">
                        <span style="font-family:monospace; color:var(--text-secondary); margin-right:10px;">${formatTime(getTaskDuration(task))}</span>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:inline-block;">${dateDisplay}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    </button>
                    <!-- Menu Button -->
                    <div class="task-menu-container">
                        <button onclick="toggleTaskMenu(event, '${task.id}')" class="btn btn-icon btn-action-menu" title="More Options">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                            </svg>
                        </button>
                        <!-- Dropdown -->
                        <div id="menu-${task.id}" class="task-menu-dropdown">
                            <!-- Menu Items -->
                            <button onclick="deleteTask('${task.id}')" class="task-menu-item danger">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>

            `;
            historyList.appendChild(item);
        });
    }

    renderAnalytics(view, filtered, start, end);
    renderStats(filtered);
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
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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

function renderStats(data) {
    // If no data passed, default to all history (or empty if preferred, but usually stats reflect invalid view?)
    // Actually, user wants stats to respect selected date range.
    // If renderStats is called without args (e.g. init?), we might want empty or all.
    // But renderHistory calls it with filtered.
    const source = data || history;

    let totalMs = source.reduce((acc, t) => acc + getTaskDuration(t), 0);
    totalTimeStat.textContent = formatTime(totalMs);
    completedCountStat.textContent = source.length;
}

// Event Listeners
addTaskBtn.addEventListener('click', () => addTask(newTaskInput.value));
newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(newTaskInput.value) });

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
    sounds.playWarning();
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

// Global Click Sound
document.addEventListener('click', (e) => {
    // Ignore keyboard-triggered clicks (Enter/Space on focused buttons)
    // browsers set detail=0 for key clicks, >0 for mouse clicks
    if (e.detail === 0) return;

    const btn = e.target.closest('button');
    if (!btn) return;

    // Exclude buttons that already have specific sounds or logic handling sounds
    if (btn.classList.contains('btn-action-play')) return;
    if (btn.classList.contains('btn-action-pause')) return;
    if (btn.classList.contains('btn-action-stop')) return; // Handles Complete/Stop
    if (btn.classList.contains('btn-action-delete')) return; // Handles Warning
    if (btn.id === 'confirmDeleteBtn') return; // Handles Cleanup
    if (btn.id === 'cleanupBtn') return; // User requested exclusion
    if (btn.hasAttribute('onclick') && btn.getAttribute('onclick').includes('performCleanup')) return; // Cleanup modal actions
    if (btn.classList.contains('logo')) return; // handled by SEGA listener (though logo is div usually, checking logic)

    // Play generic click for everything else (Tabs, Settings, Zen, Theme, Close, etc.)
    sounds.playClick();
});

// Delete Confirm Events
document.getElementById('cancelDeleteBtn').addEventListener('click', closeConfirmModal);
document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (pendingDeleteId) performDelete(pendingDeleteId);
});
document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirmModal();
});

// Manual Time Logic
function openManualTimeModal(taskId) {
    currentManualTimeTaskId = taskId;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Close menu if open
    const menu = document.getElementById(`menu-${taskId}`);
    if (menu) menu.classList.remove('show');

    document.getElementById('manualTimeModalTitle').textContent = `Add Time to: ${task.title}`;
    document.getElementById('manualHoursInput').value = 0;
    document.getElementById('manualMinutesInput').value = 0;
    document.getElementById('manualTimeModal').classList.remove('hidden');
    document.getElementById('manualHoursInput').focus();
}

function closeManualTimeModal() {
    document.getElementById('manualTimeModal').classList.add('hidden');
    currentManualTimeTaskId = null;
}

function addManualTime() {
    if (!currentManualTimeTaskId) return;

    const task = tasks.find(t => t.id === currentManualTimeTaskId);
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

    // Create a log entry
    // We'll set the start time to "now - duration" and end time to "now"
    // This way it appears as a completed block ending at the current moment.
    const now = new Date();
    const start = new Date(now.getTime() - durationMs);

    task.timeLog.push({
        id: crypto.randomUUID(),
        start: start.toISOString(),
        end: now.toISOString(),
        manual: true // Flag to identify manual entries if needed later
    });

    saveData();
    // Update DOM (Total time)
    // If it's the active task, updateGlobalUI might be needed if we were showing total time there,
    // but we only show run time of current session in title usually.
    // However, the list item shows total duration.
    const durationEl = document.querySelector(`.todo-duration[data-task-id="${currentManualTimeTaskId}"]`);
    if (durationEl) {
        durationEl.textContent = formatTime(getTaskDuration(task));
    }

    // Play Success Sound
    sounds.playClick(); // or playComplete for a nice chime

    closeManualTimeModal();
}

// Expose to window
window.closeManualTimeModal = closeManualTimeModal;
window.addManualTime = addManualTime;

document.getElementById('manualTimeModal').addEventListener('click', (e) => {
    if (e.target.id === 'manualTimeModal') closeManualTimeModal();
});


// Zen Mode Logic
const zenModeBtn = document.getElementById('zenModeBtn');
zenModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('zen-mode');
});

// Shortcuts Logic
const shortcutsModal = document.getElementById('shortcutsModal');
function openShortcutsModal() { shortcutsModal.classList.remove('hidden'); }
function closeShortcutsModal() { shortcutsModal.classList.add('hidden'); }
window.closeShortcutsModal = closeShortcutsModal; // Expose global

document.getElementById('helpBtn').addEventListener('click', openShortcutsModal);
shortcutsModal.addEventListener('click', (e) => {
    if (e.target.id === 'shortcutsModal') closeShortcutsModal();
});

// Report Generation Logic
document.getElementById('exportReportBtn').addEventListener('click', generateReport);
document.getElementById('copyReportBtn').addEventListener('click', copyReportToClipboard);

function createReportString() {
    const activeTab = document.querySelector('.tab-btn.active');
    const view = activeTab ? activeTab.dataset.view : 'week'; // Default to week report

    // Calculate Range using currentViewDate (global)
    const { start, end, label } = getDateRange(view, currentViewDate);

    let report = `# ChronoFlow Report\nRange: ${label}\nGenerated: ${new Date().toLocaleString()}\n\n`;

    // Filter History Logic (Same as renderHistory)
    const filtered = history.filter(task => {
        const lastLog = task.timeLog[task.timeLog.length - 1];
        if (!lastLog) return false;
        const taskDate = new Date(lastLog.end || lastLog.start);
        return taskDate >= start && taskDate <= end;
    });

    if (filtered.length === 0) {
        return report + "No tasks found for this period.";
    }

    // Group history by Date
    const groups = {};
    filtered.forEach(task => {
        const lastLog = task.timeLog[task.timeLog.length - 1];
        const dateKey = new Date(lastLog.end || lastLog.start).toDateString();
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(task);
    });

    // Sort Dates
    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach(date => {
        report += `## ${date}\n`;
        const dayTasks = groups[date];
        let dayTotal = 0;

        dayTasks.forEach(task => {
            const duration = getTaskDuration(task);
            dayTotal += duration;
            report += `- **${task.title}**: ${formatTime(duration)}`;
            if (task.journal.length > 0) {
                report += `\n  - *${task.journal.length} notes*`;
            }
            report += `\n`;
        });

        report += `\n**Daily Total**: ${formatTime(dayTotal)}\n\n---\n\n`;
    });

    return report;
}

function generateReport() {
    const report = createReportString();
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronoflow_report_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


function copyReportToClipboard() {
    const report = createReportString();
    navigator.clipboard.writeText(report).then(() => {
        const btn = document.getElementById('copyReportBtn');
        const originalHtml = btn.innerHTML;
        // Show Checkmark
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
            btn.innerHTML = originalHtml;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy report: ', err);
        alert('Failed to copy report to clipboard');
    });
}

// Settings Modal Logic
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');

function openSettings() {
    settingsModal.classList.remove('hidden');
    const currentVolPercent = Math.round(sounds.masterVolume * 100);
    volumeSlider.value = currentVolPercent;
    volumeValue.textContent = `${currentVolPercent}%`;

    // Set Sprint Select
    if (sprintStartSelect) {
        sprintStartSelect.value = sprintStartDay;
    }
}

function closeSettings() {
    settingsModal.classList.add('hidden');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (closeSettingsModal) closeSettingsModal.addEventListener('click', closeSettings);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);

if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        volumeValue.textContent = `${val}%`;
        sounds.setVolume(val / 100);
    });
}

const sprintStartSelect = document.getElementById('sprintStartSelect');
if (sprintStartSelect) {
    sprintStartSelect.addEventListener('change', (e) => {
        sprintStartDay = parseInt(e.target.value);
        localStorage.setItem('chrono_sprint_start_day', sprintStartDay);

        // Re-render history if in Week view to reflect change
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.view === 'week') {
            renderHistory('week');
        }
    });
}

// SEGA Easter Egg
document.querySelector('.logo').addEventListener('click', () => sounds.playSega());

// Global Keyboard Shortcuts (Enhanced)
window.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
            e.target.blur(); // Blur on Esc
            closeJournalModal();
            activeControls.classList.remove('hidden'); // Ensure UI returns
        }
        return;
    }

    if (e.key === 'Escape') {
        closeJournalModal();
        closeConfirmModal();
        closeErrorModal();
        closeCleanupModal();
        closeSettings();
        closeShortcutsModal();
        closeManualTimeModal();
    }

    if (e.key === '?' && e.shiftKey) {
        openShortcutsModal();
    }

    if (e.code === 'Space') {
        e.preventDefault(); // Prevent scroll
        if (activeTaskId) {
            document.getElementById('globalActionBtn').click();
        } else {
            // If idle, start the top-most task
            if (tasks.length > 0) {
                playTask(tasks[0].id);
            }
        }
    }
});

// Run
init();

// Menu Logic
function toggleTaskMenu(event, taskId) {
    event.stopPropagation();

    // Close other menus first
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

// Close menus when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.task-menu-container')) {
        document.querySelectorAll('.task-menu-dropdown.show').forEach(el => {
            el.classList.remove('show');
        });
    }
});

// Edit Logic
function editTaskTitle(taskId) {
    // 1. Close Menu
    const menu = document.getElementById(`menu-${taskId}`);
    if (menu) menu.classList.remove('show');

    // 2. Find Title Element
    const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
    if (!titleEl) return;

    // 3. Swap with Textarea
    // Use innerText to preserve line breaks if any, though currently titles are likely single line.
    // If we were using HTML in titles (not safe), we'd use innerHTML.
    const currentTitle = titleEl.innerText;

    // We render a textarea with onkeydown handler for Ctrl+Enter save
    // We add onblur to save as well
    // We need to escape currentTitle for the value attribute if rendering string literals,
    // but setting value prop via JS is safer. Let's do DOM manipulation.

    titleEl.innerHTML = ''; // Clear

    const textarea = document.createElement('textarea');
    textarea.className = 'task-title-input';
    textarea.value = currentTitle;
    textarea.onblur = () => saveTaskTitle(taskId, textarea.value);
    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            textarea.blur(); // Triggers save
        }
    };

    titleEl.appendChild(textarea);

    // 4. Focus
    textarea.focus();
    // Move cursor to end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function saveTaskTitle(taskId, newTitle) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const trimmed = newTitle.trim();
    if (!trimmed) {
        // Revert if empty (or maybe delete? No, revert is safer)
        const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
        if (titleEl) titleEl.textContent = task.title; // Re-render text
        return;
    }

    // Update Data
    task.title = trimmed;
    saveData(true); // Save but skip full re-render

    // Update DOM
    const titleEl = document.querySelector(`.todo-title[data-task-id="${taskId}"]`);
    if (titleEl) {
        // Use innerText to respect newlines when rendering as text
        titleEl.innerText = trimmed;
        // Note: CSS 'white-space: pre-wrap' on .todo-title might be needed if not already present.
        // Let's check style.css or add it inline if needed, but usually div doesn't wrap.
        // We'll set style locally just in case.
        titleEl.style.whiteSpace = 'pre-wrap';
    }

    // Update Global UI if Active
    if (activeTaskId === taskId) {
        updateGlobalUI(task, 'running');
    }
}
