---
trigger: model_decision
description: Use when the task requires understanding project structure or locating files. Guides REPO_MAP-first navigation strategy.
---

# 🗺️ PROTOCOL: REPO_MAP_FIRST (Multi-Layer Context)
**Objective:** Eliminate hallucinations by grounding project knowledge in the generated map files, respecting both Infrastructure and Application layers.

1.  **Mandatory Context Loading (Recursive):**
    -   **Step 0 (Verify Existence):** `REPO_MAP.md` files are **git-ignored** but exist on disk. Use `read_file` with absolute paths to access them—do NOT rely on glob/search which respects `.gitignore`. If REPO_MAP.md does not exist, ask the user to run `./scripts/generate_map.sh` to generate it.
    -   **Step 1 (Root/Infra):** Read `REPO_MAP.md` in the project root if the task involves deployment tools, Docker, or environment configs.
    -   **Step 2 (Structural):** Read `REPO_MAP_ARCHITECTURE.md` if the task requires understanding script orchestration.
    -   **Step 3 (App/Logic):** Check `REPO_MAP_APP_ARCHITECTURE.md` only for component hierarchies or data flows in the `app/` directory.
    -   **Step 4 (Nested Maps):** If the task is purely Application-focused and `REPO_MAP.md` lists a nested `app/REPO_MAP.md`, read the nested map directly to avoid root map noise.
    -   **Step 5 (Synthesis):** Merge all discovered maps and architecture trees into a single mental model.

2.  **Navigation Strategy:**
    -   **Do not** ask "What files are in this repo?" or "Can you list the modules?"
    -   **Do not** execute `ls -R` or `find .` to explore.
    -   **Do not** use glob/search to find REPO_MAP files—they are git-ignored and won't appear in results.
    -   Derive file existence and paths strictly from the `## Directory Structure` sections of **ALL** discovered `REPO_MAP.md` files.

3.  **Contextual Understanding:**
    -   **For Scripts/Ops:** Consult the `## File Signatures` in the **Root Map** to understand deployment logic (Docker, Bash).
    -   **For App Logic:** Consult the `## File Signatures` in the **Nested App Map** to understand business logic (Models, Controllers, Components).
    -   **Blind Spot Rule:** If a file is NOT listed in any `REPO_MAP.md`, assume it is git-ignored (like secrets or `node_modules`) and treat it as non-existent unless explicitly provided.
