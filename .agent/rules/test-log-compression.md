---
title: Test Log Compression Rule
trigger: model_decision
category: Reference
description: Compresses test run output logs to prevent context window bloat.
context: Test Run Execution
---

# 📝 PROTOCOL: TEST LOG COMPRESSION (essentia)

**Objective**: Prevent npm / Jest / Vitest runners from flooding the context window with verbose logs and stack traces on failures.

## Rules

1. **Fail-Fast Mode**:
   - Always run tests with `--bail` or fail-fast flags if supported, so execution halts on the first failure.
   - Example: `./scripts/bootstraping/run.sh npm run test -- --bail=1` or equivalent.

2. **Compress Failure Logs**:
   - If tests fail, do NOT paste or analyze the entire test suite log.
   - Locate and inspect ONLY the assertion failure message, the expected vs. actual values, and the exact `file:line` reference.
   - Discard passing test suites and framework setup logs from your output.
