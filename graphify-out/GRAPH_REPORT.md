# Graph Report - time_tracker  (2026-11-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 122 nodes · 330 edges · 9 communities (6 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8e7008f4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8

## God Nodes (most connected - your core abstractions)
1. `saveData()` - 17 edges
2. `SoundManager` - 14 edges
3. `renderHistory()` - 14 edges
4. `formatTime()` - 14 edges
5. `getTaskDuration()` - 13 edges
6. `renderTasks()` - 12 edges
7. `updateGlobalUI()` - 12 edges
8. `formatDate()` - 9 edges
9. `requestToken()` - 8 edges
10. `state` - 8 edges

## Surprising Connections (you probably didn't know these)
- `init()` --calls--> `loadData()`  [EXTRACTED]
  script.js → src/js/persistence.js
- `init()` --calls--> `renderTasks()`  [EXTRACTED]
  script.js → src/js/ui.js
- `openSettings()` --calls--> `getSavedUser()`  [EXTRACTED]
  script.js → src/js/sync.js
- `init()` --calls--> `loadTheme()`  [EXTRACTED]
  script.js → src/js/theme.js
- `openSettings()` --calls--> `getCloudMeta()`  [EXTRACTED]
  script.js → src/js/sync.js

## Import Cycles
- 3-file cycle: `src/js/journal.js -> src/js/persistence.js -> src/js/ui.js -> src/js/journal.js`

## Communities (9 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.19
Nodes (22): sounds, loadData(), saveData(), state, addTask(), changeTaskPriority(), completingTaskIds, deleteTask() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.27
Nodes (17): disconnect(), downloadBackup(), fetchUserProfile(), findCloudBackup(), getClientId(), getSavedToken(), getSavedUser(), handleAuthError() (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (8): openSettings(), updateGoogleSyncUI(), getCloudMeta(), copyTasksToClipboard(), createTasksReportString(), generateTasksReport(), loadTheme(), toggleTheme()

### Community 3 - "Community 3"
Cohesion: 0.30
Nodes (14): init(), changePeriod(), copyReportToClipboard(), createReportString(), generateReport(), getDateRange(), getEndOfWeek(), getStartOfWeek() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.25
Nodes (14): COLOR_ERROR, COLOR_INFO, COLOR_RESET, COLOR_SUCCESS, COLOR_WARN, error_handler(), executeCommand(), log() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.39
Nodes (8): handleJournalSubmit(), addJournal(), closeJournalModal(), copyJournalToClipboard(), openJournalModal(), renderJournalList(), updateJournalBadges(), formatDate()

## Knowledge Gaps
- **9 isolated node(s):** `completingTaskIds`, `initialTokenData`, `COLOR_ERROR`, `COLOR_INFO`, `COLOR_RESET` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SoundManager` connect `Community 5` to `Community 0`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `saveData()` connect `Community 0` to `Community 2`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `renderHistory()` connect `Community 3` to `Community 0`, `Community 2`, `Community 6`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `completingTaskIds`, `initialTokenData`, `COLOR_ERROR` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._