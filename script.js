/**
 * @file script.js
 * @category Core
 * @description Main entry point for ChronoFlow
 * @requires state, ui, theme, persistence, tasks, audio, history, journal, utils, sync
 */
import { state } from './src/js/state.js';
import { loadData, saveData } from './src/js/persistence.js';
import { loadTheme, toggleTheme } from './src/js/theme.js';
import { renderTasks, startGlobalTicker, closeErrorModal, closeConfirmModal, closeManualTimeModal, addManualTime } from './src/js/ui.js';
import { renderHistory, changePeriod, generateReport, copyReportToClipboard } from './src/js/history.js';
import { addTask, playTask, generateTasksReport, copyTasksToClipboard } from './src/js/tasks.js';
import { sounds } from './src/js/audio.js';
import { closeJournalModal, addJournal, copyJournalToClipboard } from './src/js/journal.js';
import { getTaskDuration, formatTime, formatDate } from './src/js/utils.js';
import {
    getSavedUser,
    getCloudMeta,
    signIn as googleSignIn,
    uploadBackup as googleUploadBackup,
    downloadBackup as googleDownloadBackup,
    disconnect as googleDisconnect,
    findCloudBackup as googleFindCloudBackup,
    getClientId as getGoogleClientId,
    setClientId as setGoogleClientId
} from './src/js/sync.js';

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

    const newTaskPriority = document.getElementById('newTaskPriority');
    if (addTaskBtn) addTaskBtn.addEventListener('click', () => addTask(newTaskInput.value, newTaskPriority.value));
    if (newTaskInput) newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(newTaskInput.value, newTaskPriority.value) });

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
    const exportReportBtn = document.getElementById('exportReportBtn');
    const copyReportBtn = document.getElementById('copyReportBtn');

    if (exportReportBtn) exportReportBtn.addEventListener('click', generateReport);
    if (copyReportBtn) copyReportBtn.addEventListener('click', copyReportToClipboard);

    // Tasks Export Logic
    const exportTasksBtn = document.getElementById('exportTasksBtn');
    const copyTasksBtn = document.getElementById('copyTasksBtn');

    if (exportTasksBtn) exportTasksBtn.addEventListener('click', generateTasksReport);
    if (copyTasksBtn) copyTasksBtn.addEventListener('click', copyTasksToClipboard);

    // Google Drive Cloud Sync
    const googleSyncDisconnected = document.getElementById('googleSyncDisconnected');
    const googleSyncConnected = document.getElementById('googleSyncConnected');
    const googleUserAvatar = document.getElementById('googleUserAvatar');
    const googleUserName = document.getElementById('googleUserName');
    const googleUserEmail = document.getElementById('googleUserEmail');
    const cloudLastSyncTime = document.getElementById('cloudLastSyncTime');
    const cloudBackupSize = document.getElementById('cloudBackupSize');
    const btnGoogleSignin = document.getElementById('btnGoogleSignin');
    const btnGoogleSignout = document.getElementById('btnGoogleSignout');
    const btnCloudBackup = document.getElementById('btnCloudBackup');
    const btnCloudRestore = document.getElementById('btnCloudRestore');
    const googleClientIdInput = document.getElementById('googleClientIdInput');
    const btnSaveClientId = document.getElementById('btnSaveClientId');

    const cloudRestoreModal = document.getElementById('cloudRestoreModal');
    const closeCloudRestoreModalDom = document.getElementById('closeCloudRestoreModal');
    const cancelCloudRestoreBtn = document.getElementById('cancelCloudRestoreBtn');
    const confirmCloudRestoreBtn = document.getElementById('confirmCloudRestoreBtn');
    const cloudRestoreModalTime = document.getElementById('cloudRestoreModalTime');
    const cloudRestoreModalSize = document.getElementById('cloudRestoreModalSize');
    let pendingCloudRestoreData = null;

    function updateGoogleSyncUI(user, meta) {
        if (!googleSyncDisconnected || !googleSyncConnected) return;

        if (user) {
            googleSyncDisconnected.classList.add('hidden');
            googleSyncConnected.classList.remove('hidden');

            if (googleUserAvatar) googleUserAvatar.src = user.picture || 'src/img/favicon.png';
            if (googleUserName) googleUserName.textContent = user.name || 'Google User';
            if (googleUserEmail) googleUserEmail.textContent = user.email || '';

            const currentMeta = meta || getCloudMeta();
            if (currentMeta) {
                if (cloudLastSyncTime) {
                    cloudLastSyncTime.textContent = currentMeta.lastSyncTime ? new Date(currentMeta.lastSyncTime).toLocaleString() : 'Never';
                }
                if (cloudBackupSize) {
                    cloudBackupSize.textContent = currentMeta.sizeBytes ? `${(currentMeta.sizeBytes / 1024).toFixed(1)} KB` : '-';
                }
            } else {
                if (cloudLastSyncTime) cloudLastSyncTime.textContent = 'Never';
                if (cloudBackupSize) cloudBackupSize.textContent = '-';
            }
        } else {
            googleSyncDisconnected.classList.remove('hidden');
            googleSyncConnected.classList.add('hidden');
        }

        if (googleClientIdInput) {
            googleClientIdInput.value = getGoogleClientId();
        }
    }

    if (btnGoogleSignin) {
        btnGoogleSignin.addEventListener('click', async () => {
            try {
                await googleSignIn();
                const user = getSavedUser();
                if (user) {
                    sounds.playSuccess();
                    updateGoogleSyncUI(user);

                    try {
                        const cloudFile = await googleFindCloudBackup();
                        if (cloudFile) {
                            updateGoogleSyncUI(user, {
                                lastSyncTime: cloudFile.modifiedTime,
                                sizeBytes: cloudFile.size
                            });
                        }
                    } catch (e) {
                        console.warn('Could not inspect cloud file:', e);
                    }
                }
            } catch (err) {
                console.error('Google Sign In Error:', err);
                alert(err.message || 'Google sign-in failed. Please check your connection or popup settings.');
            }
        });
    }

    if (btnGoogleSignout) {
        btnGoogleSignout.addEventListener('click', () => {
            googleDisconnect();
            updateGoogleSyncUI(null);
            sounds.playClick();
        });
    }

    if (btnSaveClientId) {
        btnSaveClientId.addEventListener('click', () => {
            if (googleClientIdInput) {
                setGoogleClientId(googleClientIdInput.value);
                alert('OAuth Client ID saved successfully!');
            }
        });
    }

    if (btnCloudBackup) {
        btnCloudBackup.addEventListener('click', async () => {
            try {
                btnCloudBackup.disabled = true;
                btnCloudBackup.textContent = 'Uploading...';
                const meta = await googleUploadBackup();
                const user = getSavedUser();
                updateGoogleSyncUI(user, meta);
                sounds.playSuccess();
                alert('Backup successfully uploaded to your Google Drive AppData folder!');
            } catch (err) {
                console.error('Cloud Backup Error:', err);
                sounds.playWarning();
                alert(err.message || 'Cloud backup failed.');
            } finally {
                btnCloudBackup.disabled = false;
                btnCloudBackup.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                        <polyline points="12 13 12 7 9 10"/>
                        <polyline points="12 7 15 10"/>
                    </svg>
                    <span>Backup (Upload)</span>
                `;
            }
        });
    }

    function closeCloudRestoreModal() {
        if (cloudRestoreModal) cloudRestoreModal.classList.add('hidden');
        pendingCloudRestoreData = null;
    }

    if (btnCloudRestore) {
        btnCloudRestore.addEventListener('click', async () => {
            try {
                btnCloudRestore.disabled = true;
                btnCloudRestore.textContent = 'Checking...';
                const { data, meta } = await googleDownloadBackup();
                pendingCloudRestoreData = data;

                if (cloudRestoreModalTime) {
                    cloudRestoreModalTime.textContent = meta.lastSyncTime ? new Date(meta.lastSyncTime).toLocaleString() : 'Unknown';
                }
                if (cloudRestoreModalSize) {
                    cloudRestoreModalSize.textContent = meta.sizeBytes ? `${(meta.sizeBytes / 1024).toFixed(1)} KB` : 'Unknown';
                }

                if (cloudRestoreModal) cloudRestoreModal.classList.remove('hidden');
            } catch (err) {
                console.error('Cloud Restore Error:', err);
                sounds.playWarning();
                alert(err.message || 'Failed to download cloud backup.');
            } finally {
                btnCloudRestore.disabled = false;
                btnCloudRestore.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                        <polyline points="12 10 12 16 9 13"/>
                        <polyline points="12 16 15 13"/>
                    </svg>
                    <span>Restore (Download)</span>
                `;
            }
        });
    }

    if (closeCloudRestoreModalDom) closeCloudRestoreModalDom.addEventListener('click', closeCloudRestoreModal);
    if (cancelCloudRestoreBtn) cancelCloudRestoreBtn.addEventListener('click', closeCloudRestoreModal);
    if (cloudRestoreModal) {
        cloudRestoreModal.addEventListener('click', (e) => {
            if (e.target.id === 'cloudRestoreModal') closeCloudRestoreModal();
        });
    }

    if (confirmCloudRestoreBtn) {
        confirmCloudRestoreBtn.addEventListener('click', () => {
            if (!pendingCloudRestoreData) return;

            state.tasks = Array.isArray(pendingCloudRestoreData.tasks) ? pendingCloudRestoreData.tasks : [];
            state.history = Array.isArray(pendingCloudRestoreData.history) ? pendingCloudRestoreData.history : [];
            if (pendingCloudRestoreData.sprintStartDay !== undefined) {
                state.sprintStartDay = pendingCloudRestoreData.sprintStartDay;
                localStorage.setItem('chrono_sprint_start_day', state.sprintStartDay);
            }
            if (pendingCloudRestoreData.timerRefreshRate !== undefined) {
                state.timerRefreshRate = pendingCloudRestoreData.timerRefreshRate;
                localStorage.setItem('chrono_refresh_rate', state.timerRefreshRate);
            }

            saveData();
            renderTasks();
            const activeTab = document.querySelector('.tab-btn.active');
            renderHistory(activeTab ? activeTab.dataset.view : 'day');

            sounds.playSuccess();
            closeCloudRestoreModal();
            alert('Cloud backup successfully restored!');
        });
    }

    // Settings Modal
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsModalDom = document.getElementById('closeSettingsModal');
    const closeSettingsBtnDom = document.getElementById('closeSettingsBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const sprintStartSelect = document.getElementById('sprintStartSelect');
    const refreshRateSelect = document.getElementById('refreshRateSelect');

    function openSettings() {
        if (settingsModal) settingsModal.classList.remove('hidden');
        const currentVolPercent = Math.round(sounds.masterVolume * 100);
        if (volumeSlider) volumeSlider.value = currentVolPercent;
        if (volumeValue) volumeValue.textContent = `${currentVolPercent}%`;

        if (sprintStartSelect) {
            sprintStartSelect.value = state.sprintStartDay;
        }
        if (refreshRateSelect) {
            refreshRateSelect.value = state.timerRefreshRate;
        }

        updateGoogleSyncUI(getSavedUser(), getCloudMeta());
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

    if (refreshRateSelect) {
        refreshRateSelect.addEventListener('change', (e) => {
            state.timerRefreshRate = parseInt(e.target.value);
            localStorage.setItem('chrono_refresh_rate', state.timerRefreshRate);

            import('./src/js/ui.js').then(module => {
                module.startGlobalTicker();
                module.renderTasks();
                if (state.activeTaskId) {
                    const task = state.tasks.find(t => t.id === state.activeTaskId);
                    if (task) {
                        const isRunning = task.timeLog.some(l => l.end === null);
                        module.updateGlobalUI(task, isRunning ? 'running' : 'paused');
                    }
                }
            });
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
            closeCloudRestoreModal();
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

    updateGoogleSyncUI(getSavedUser(), getCloudMeta());
    init();
});

// For HTML inline generic onClick like addManualTime
window.addManualTime = addManualTime;
window.closeManualTimeModal = closeManualTimeModal;
window.closeErrorModal = closeErrorModal;
