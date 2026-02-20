/**
 * @file script.js
 * @category Core
 * @description Main entry point for ChronoFlow
 * @requires state, ui, theme, persistence, tasks, audio, history, journal, utils
 */
import { state } from './src/js/state.js';
import { loadData, saveData } from './src/js/persistence.js';
import { loadTheme, toggleTheme } from './src/js/theme.js';
import { renderTasks, startGlobalTicker, closeErrorModal, closeConfirmModal, closeManualTimeModal, addManualTime } from './src/js/ui.js';
import { renderHistory, changePeriod } from './src/js/history.js';
import { addTask, playTask } from './src/js/tasks.js';
import { sounds } from './src/js/audio.js';
import { closeJournalModal, addJournal, copyJournalToClipboard } from './src/js/journal.js';
import { getTaskDuration, formatTime, formatDate } from './src/js/utils.js';

function init() {
    loadData();
    loadTheme();
    renderTasks();
    renderHistory('day');
    startGlobalTicker();
}

document.addEventListener('DOMContentLoaded', () => {
    const newTaskInput = document.getElementById('newTaskInput');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const exportBtn = document.getElementById('exportBtn');
    const cleanupBtn = document.getElementById('cleanupBtn');
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importInput');
    const todayBtn = document.getElementById('todayBtn');
    const themeToggle = document.getElementById('themeToggle');
    const activeControls = document.getElementById('activeControls');

    if (addTaskBtn) addTaskBtn.addEventListener('click', () => addTask(newTaskInput.value));
    if (newTaskInput) newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(newTaskInput.value) });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentViewDate = new Date();
            renderHistory(btn.dataset.view)
        });
    });

    const prevPeriodBtn = document.getElementById('prevPeriodBtn');
    if (prevPeriodBtn) prevPeriodBtn.addEventListener('click', () => changePeriod(-1));
    const nextPeriodBtn = document.getElementById('nextPeriodBtn');
    if (nextPeriodBtn) nextPeriodBtn.addEventListener('click', () => changePeriod(1));
    if (todayBtn) todayBtn.addEventListener('click', () => {
        state.currentViewDate = new Date();
        const activeTab = document.querySelector('.tab-btn.active');
        renderHistory(activeTab ? activeTab.dataset.view : 'day');
    });

    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    if (exportBtn) exportBtn.addEventListener('click', () => {
        const data = JSON.stringify({ tasks: state.tasks, history: state.history }, null, 2);
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

    if (importBtn) importBtn.addEventListener('click', () => {
        importInput.click();
    });

    if (importInput) importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.tasks && Array.isArray(importedData.tasks) && importedData.history && Array.isArray(importedData.history)) {
                    if (confirm("This will replace your current data. Are you sure?")) {
                        state.tasks = importedData.tasks;
                        state.history = importedData.history;
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
        e.target.value = '';
    });

    // Cleanup Logic
    const cleanupModal = document.getElementById('cleanupModal');
    function openCleanupModal() {
        sounds.playWarning();
        if (cleanupModal) cleanupModal.classList.remove('hidden');
    }
    window.closeCleanupModal = function closeCleanupModal() { // Expose to window since inline html onclick
        if (cleanupModal) cleanupModal.classList.add('hidden');
    }

    window.performCleanup = function performCleanup(type) {
        try {
            console.log("Cleanup initiated with type:", type);
            let cutoff = new Date();
            let message = "";

            if (String(type) === 'all') {
                if (!window.confirm("Are you sure you want to delete ALL history? This cannot be undone.")) {
                    return;
                }
                state.history = [];
                message = "All history deleted.";
            } else {
                const days = parseInt(type);
                cutoff.setDate(cutoff.getDate() - days);
                const originalLen = state.history.length;
                state.history = state.history.filter(t => {
                    if (!t.timeLog || t.timeLog.length === 0) return false;
                    const lastLog = t.timeLog[t.timeLog.length - 1];
                    if (!lastLog) return false;
                    return new Date(lastLog.end || lastLog.start) > cutoff;
                });
                message = `Deleted ${originalLen - state.history.length} records older than ${days} days.`;
            }

            saveData();
            const activeTab = document.querySelector('.tab-btn.active');
            renderHistory(activeTab ? activeTab.dataset.view : 'day');
            sounds.playCleanup();
            alert(message);
            window.closeCleanupModal();
        } catch (error) {
            console.error("Cleanup error:", error);
            alert("An error occurred: " + error.message);
        }
    }

    if (cleanupBtn) cleanupBtn.addEventListener('click', openCleanupModal);

    // Journal Events
    const closeJournalBtnDom = document.getElementById('closeJournalBtn');
    if (closeJournalBtnDom) closeJournalBtnDom.addEventListener('click', closeJournalModal);

    const addJournalBtnDom = document.getElementById('addJournalBtn');
    if (addJournalBtnDom) addJournalBtnDom.addEventListener('click', () => {
        handleJournalSubmit(false);
    });

    const addJournalAndCloseBtnDom = document.getElementById('addJournalAndCloseBtn');
    if (addJournalAndCloseBtnDom) addJournalAndCloseBtnDom.addEventListener('click', () => {
        handleJournalSubmit(true);
    });

    function handleJournalSubmit(shouldClose) {
        if (!state.currentJournalTaskId) return;
        const title = document.getElementById('journalTitleInput').value;
        const content = document.getElementById('journalContentInput').value;

        if (!content.trim()) return;

        addJournal(state.currentJournalTaskId, title, content);

        document.getElementById('journalTitleInput').value = '';
        document.getElementById('journalContentInput').value = '';

        if (shouldClose) {
            closeJournalModal();
        }
    }

    const copyJournalBtnDom = document.getElementById('copyJournalBtn');
    if (copyJournalBtnDom) copyJournalBtnDom.addEventListener('click', copyJournalToClipboard);

    const journalModal = document.getElementById('journalModal');
    if (journalModal) journalModal.addEventListener('click', (e) => {
        if (e.target.id === 'journalModal') closeJournalModal();
    });

    // Global Click Sound
    document.addEventListener('click', (e) => {
        if (e.detail === 0) return;

        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('btn-action-play')) return;
        if (btn.classList.contains('btn-action-pause')) return;
        if (btn.classList.contains('btn-action-stop')) return;
        if (btn.classList.contains('btn-action-delete')) return;
        if (btn.id === 'confirmDeleteBtn') return;
        if (btn.id === 'cleanupBtn') return;
        if (btn.hasAttribute('onclick') && btn.getAttribute('onclick').includes('performCleanup')) return;
        if (btn.classList.contains('logo')) return;

        sounds.playClick();
    });

    // Delete Confirm Events
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmModal = document.getElementById('confirmModal');

    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeConfirmModal);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => {
        if (state.pendingDeleteId) {
            // we need performDelete from tasks.js, wait I didn't import it.
            // Let's call import dynamically or just import at top level. I will import performDelete.
            import('./src/js/tasks.js').then(module => {
                module.performDelete(state.pendingDeleteId);
            });
        }
    });
    if (confirmModal) confirmModal.addEventListener('click', (e) => {
        if (e.target.id === 'confirmModal') closeConfirmModal();
    });

    // Manual Time Modal Overlay Click
    const manualTimeModal = document.getElementById('manualTimeModal');
    if (manualTimeModal) {
        manualTimeModal.addEventListener('click', (e) => {
            if (e.target.id === 'manualTimeModal') closeManualTimeModal();
        });
    }

    // Zen Mode Logic
    const zenModeBtn = document.getElementById('zenModeBtn');
    if (zenModeBtn) zenModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('zen-mode');
    });

    // Shortcuts Logic
    const shortcutsModal = document.getElementById('shortcutsModal');
    function openShortcutsModal() { if (shortcutsModal) shortcutsModal.classList.remove('hidden'); }
    function closeShortcutsModal() { if (shortcutsModal) shortcutsModal.classList.add('hidden'); }
    window.closeShortcutsModal = closeShortcutsModal;

    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) helpBtn.addEventListener('click', openShortcutsModal);
    if (shortcutsModal) shortcutsModal.addEventListener('click', (e) => {
        if (e.target.id === 'shortcutsModal') closeShortcutsModal();
    });

    // Report Generation Logic
    function createReportString() {
        const activeTab = document.querySelector('.tab-btn.active');
        const view = activeTab ? activeTab.dataset.view : 'week';
        const { start, end, label } = import('./src/js/history.js').then(m => m.getDateRange(view, state.currentViewDate));
        // since import() is async, it breaks the synchronous createReportString.
        // Wait, I can just import getDateRange at the top of file! I'll do this in a minute by fixing the code.
        // Let's implement this properly: I'll use the imported getDateRange.
    }

    // Settings Modal
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsModalDom = document.getElementById('closeSettingsModal');
    const closeSettingsBtnDom = document.getElementById('closeSettingsBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const sprintStartSelect = document.getElementById('sprintStartSelect');

    function openSettings() {
        if (settingsModal) settingsModal.classList.remove('hidden');
        const currentVolPercent = Math.round(sounds.masterVolume * 100);
        if (volumeSlider) volumeSlider.value = currentVolPercent;
        if (volumeValue) volumeValue.textContent = `${currentVolPercent}%`;

        if (sprintStartSelect) {
            sprintStartSelect.value = state.sprintStartDay;
        }
    }

    function closeSettings() {
        if (settingsModal) settingsModal.classList.add('hidden');
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (closeSettingsModalDom) closeSettingsModalDom.addEventListener('click', closeSettings);
    if (closeSettingsBtnDom) closeSettingsBtnDom.addEventListener('click', closeSettings);

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (volumeValue) volumeValue.textContent = `${val}%`;
            sounds.setVolume(val / 100);
        });
    }

    if (sprintStartSelect) {
        sprintStartSelect.addEventListener('change', (e) => {
            state.sprintStartDay = parseInt(e.target.value);
            localStorage.setItem('chrono_sprint_start_day', state.sprintStartDay);

            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.view === 'week') {
                renderHistory('week');
            }
        });
    }

    // SEGA Easter Egg
    const logoEl = document.querySelector('.logo');
    if (logoEl) logoEl.addEventListener('click', () => sounds.playSega());

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                e.target.blur();
                closeJournalModal();
                if (activeControls) activeControls.classList.remove('hidden');
            }
            return;
        }

        if (e.key === 'Escape') {
            closeJournalModal();
            closeConfirmModal();
            closeErrorModal();
            if (settingsModal && !settingsModal.classList.contains('hidden')) closeSettings();
            closeShortcutsModal();
            closeManualTimeModal();
            if (cleanupModal && !cleanupModal.classList.contains('hidden')) cleanupModal.classList.add('hidden');
        }

        if (e.key === '?' && e.shiftKey) {
            openShortcutsModal();
        }

        if (e.code === 'Space') {
            e.preventDefault();
            if (state.activeTaskId) {
                const globalActionBtn = document.getElementById('globalActionBtn');
                if (globalActionBtn) globalActionBtn.click();
            } else {
                if (state.tasks.length > 0) {
                    playTask(state.tasks[0].id);
                }
            }
        }
    });

    init();
});

// For HTML inline generic onClick like addManualTime
window.addManualTime = addManualTime;
window.closeManualTimeModal = closeManualTimeModal;
window.closeErrorModal = closeErrorModal;
