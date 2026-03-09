/**
 * @file state.js
 * @description Centralized state management for ChronoFlow
 * @requires None
 */

export const state = {
    tasks: [],
    history: [],
    activeTaskId: null,
    timerInterval: null,
    currentJournalTaskId: null,
    currentViewDate: new Date(),
    pendingDeleteId: null,
    currentManualTimeTaskId: null,
    sprintStartDay: 0,
    timerRefreshRate: parseInt(localStorage.getItem('chrono_refresh_rate')) || 60000
};
