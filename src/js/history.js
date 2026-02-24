/**
 * @file history.js
 * @description History, stats, and analytics tab logic
 * @requires state, utils, ui
 */
import { state } from './state.js';
import { formatDate, formatTime, getTaskDuration } from './utils.js';

export function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    let diff = day - state.sprintStartDay;
    if (diff < 0) diff += 7;
    const start = new Date(d.setDate(d.getDate() - diff));
    start.setHours(0, 0, 0, 0);
    return start;
}

export function getEndOfWeek(date) {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

export function getDateRange(view, referenceDate) {
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

export function changePeriod(offset) {
    const view = document.querySelector('.tab-btn.active').dataset.view;
    if (view === 'day') {
        state.currentViewDate.setDate(state.currentViewDate.getDate() + offset);
    } else if (view === 'week') {
        state.currentViewDate.setDate(state.currentViewDate.getDate() + (offset * 7));
    } else if (view === 'month') {
        state.currentViewDate.setMonth(state.currentViewDate.getMonth() + offset);
    } else if (view === 'year') {
        state.currentViewDate.setFullYear(state.currentViewDate.getFullYear() + offset);
    }
    renderHistory(view);
}

export function renderHistory(view) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const activeTabObj = document.querySelector(`[data-view="${view}"]`);
    if (activeTabObj) activeTabObj.classList.add('active');

    const { start, end, label } = getDateRange(view, state.currentViewDate);
    document.getElementById('historyRangeLabel').textContent = label;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    const filtered = state.history.filter(task => {
        const lastLog = task.timeLog[task.timeLog.length - 1];
        if (!lastLog) return false;
        const taskDate = new Date(lastLog.end || lastLog.start);
        return taskDate >= start && taskDate <= end;
    });

    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><p>No history for this period.</p></div>`;
    } else {
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
            const lastLog = task.timeLog[task.timeLog.length - 1];

            const createdStr = task.createdAt ? formatDate(task.createdAt) : '';
            const completedDate = task.completedAt || (lastLog ? lastLog.end : null);
            const completedStr = completedDate ? formatDate(completedDate) : 'Unknown';

            let dateDisplay = '';
            if (createdStr) {
                dateDisplay = `Created: ${createdStr} <br> Completed: ${completedStr}`;
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
                    <button onclick="openJournalModal('${task.id}')" class="btn btn-icon btn-action-journal" title="Journal" style="position: relative;">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                       ${task.journal && task.journal.length > 0 ? `<span class="journal-badge">${task.journal.length}</span>` : ''}
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

export function renderAnalytics(view, data, start, end) {
    const container = document.getElementById('analyticsChart');
    if (view === 'day') {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    const map = new Map();
    const labels = [];
    let current = new Date(start);
    const endDt = new Date(end);
    const isYear = view === 'year';

    const getKey = (d) => {
        if (isYear) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return d.toISOString().split('T')[0];
    };

    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    while (current <= endDt) {
        const k = getKey(current);
        if (!map.has(k)) {
            map.set(k, 0);
            const label = isYear ? monthNames[current.getMonth()] : current.getDate();
            labels.push({ key: k, label: label });
        }
        if (isYear) {
            current.setMonth(current.getMonth() + 1);
        } else {
            current.setDate(current.getDate() + 1);
        }
    }

    data.forEach(task => {
        task.timeLog.forEach(log => {
            if (!log.end) return;
            const logDate = new Date(log.start);
            const k = getKey(logDate);
            const duration = new Date(log.end) - logDate;
            if (map.has(k)) {
                map.set(k, map.get(k) + duration);
            }
        });
    });

    const maxVal = Math.max(...map.values()) || 1;
    const chart = document.createElement('div');
    chart.className = 'chart-bars';

    labels.forEach(item => {
        const val = map.get(item.key);
        const percent = Math.min((val / maxVal) * 100, 100);
        const barWrap = document.createElement('div');
        barWrap.className = 'bar-wrap';
        barWrap.title = `${item.key}: ${formatTime(val)}`;

        barWrap.innerHTML = `
            <div class="bar" style="height: ${percent}%;"></div>
            <div class="bar-label">${item.label}</div>
        `;
        chart.appendChild(barWrap);
    });

    container.appendChild(chart);

    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '0.5rem';
    header.style.fontSize = '0.85rem';
    header.style.color = 'var(--text-muted)';
    header.textContent = isYear ? "Monthly Activity Distribution" : "Daily Activity Distribution";
    container.insertBefore(header, container.firstChild);
}

export function renderStats(data) {
    const source = data || state.history;

    let totalMs = source.reduce((acc, t) => acc + getTaskDuration(t), 0);
    document.getElementById('totalTimeStat').textContent = formatTime(totalMs);
    document.getElementById('completedCountStat').textContent = source.length;
}

export function createReportString() {
    const activeTab = document.querySelector('.tab-btn.active');
    const view = activeTab ? activeTab.dataset.view : 'week';

    const { start, end, label } = getDateRange(view, state.currentViewDate);
    let report = `# ChronoFlow Report\nRange: ${label}\nGenerated: ${new Date().toLocaleString()}\n\n`;

    const groups = {};
    let hasLog = false;

    state.history.forEach(task => {
        task.timeLog.forEach(log => {
            if (!log.end) return;
            const logStart = new Date(log.start);
            if (logStart >= start && logStart <= end) {
                hasLog = true;
                const dateKey = logStart.toDateString();
                const logDuration = new Date(log.end) - logStart;

                if (!groups[dateKey]) groups[dateKey] = [];

                const existing = groups[dateKey].find(t => t.id === task.id);
                if (existing) {
                    existing.duration += logDuration;
                } else {
                    groups[dateKey].push({
                        id: task.id,
                        title: task.title,
                        duration: logDuration,
                        journal: task.journal
                    });
                }
            }
        });
    });

    if (!hasLog) {
        return report + "No tasks found for this period.";
    }

    Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).forEach(dateKey => {
        report += `## ${dateKey}\n\n`;
        let dayTotal = 0;
        groups[dateKey].forEach(taskItem => {
            dayTotal += taskItem.duration;
            report += `- **${taskItem.title}**: ${formatTime(taskItem.duration)}\n`;
            if (taskItem.journal && taskItem.journal.length > 0) {
                const dayJournals = taskItem.journal.filter(entry => new Date(entry.createdAt).toDateString() === dateKey);
                dayJournals.forEach(entry => {
                    report += `  - *${entry.title || 'Note'}*: ${entry.content}\n`;
                });
            }
        });
        report += `\n**Daily Total**: ${formatTime(dayTotal)}\n\n---\n\n`;
    });

    return report;
}

export function generateReport() {
    const report = createReportString();
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ChronoFlow_Report_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function copyReportToClipboard() {
    const report = createReportString();
    navigator.clipboard.writeText(report).then(() => {
        const btn = document.getElementById('copyReportBtn');
        if (!btn) return;
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
