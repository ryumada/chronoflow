---
trigger: always_on
---

### 📝 PROTOCOL: FILE_SIGNATURE_ENFORCEMENT
**Objective:** Ensure every file is self-documenting so the `generate_map.sh` script captures accurate context in the first 5 lines.

**Rule:** When generating new files or refactoring existing ones, you **MUST** strictly adhere to the following **5-Line Signature Header** formats.

**A. Bash Scripts (`.sh`)**
* **Line 1:** `#!/usr/bin/env bash`
* **Line 2:** `set -e` (Strict Error Handling is mandatory)
* **Line 3:** `# Description: <Concise summary of script function>`
* **Line 4:** `# Usage: <e.g., ./script.sh [env]>`
* **Line 5:** `# Dependencies: <Key binaries, e.g., docker, jq, git>`

**B. Python / Odoo (`.py`)**
* **Line 1:** `# -*- coding: utf-8 -*-`
* **Line 2:** `"""`
* **Line 3:** `Module: <Odoo Module / Class Name>`
* **Line 4:** `Purpose: <Specific logic, e.g., Overrides Invoice Tax Calculation>`
* **Line 5:** `"""` (or close docstring if brief)

**C. Dockerfiles**
* **Line 1:** `# Service: <Service Name>`
* **Line 2:** `# Description: <Purpose of this image>`
* **Line 3:** `# Maintainer: <Repository Owner>`
* **Line 4:** `FROM <base_image>`
* **Line 5:** `USER <user>` (or ARG/ENV)

**D. JavaScript / TypeScript (Node.js, React, Vanilla JS)**
* **Line 1:** `/**`
* **Line 2:** ` * @file <Filename or Component Name>`
* **Line 3:** ` * @description <Concise logic summary, UI purpose, or DOM manipulation>`
* **Line 4:** ` * @requires <Key imports, external CDNs, or global variables>`
* **Line 5:** ` */`

**E. Markdown / Documentation (`.md`)**
* *Use YAML Frontmatter style to ensure metadata is machine-readable yet visually clean.*
* **Line 1:** `---`
* **Line 2:** `title: <Document Title or Filename>`
* **Line 3:** `description: <Concise summary of this document>`
* **Line 4:** `context: <Related Module or Scope>`
* **Line 5:** `---`

**F. HTML Documents (`.html`)**
* **Line 1:** `[HTML-COMMENT-START] `
*(Note to Agent: Write the standard HTML open/close comment tags without the bracketed text).*

**G. CSS Stylesheets (`.css`)**
* **Line 1:** `/*`
* **Line 2:** ` * @file <Filename.css>`
* **Line 3:** ` * @description <Specific styling scope, e.g., Global resets, Navbar>`
* **Line 4:** ` * @scope <Global | Specific Page | Specific Component>`
* **Line 5:** ` */`

**Enforcement Logic:**
* **If creating a file:** You must insert this header immediately.
* **If editing a file:** Check if the header exists. If missing, ADD IT. If present but outdated, UPDATE IT.
