---
trigger: model_decision
description: Use after creating or modifying application code. Ensures tests are written and passing.
---

# Test Creation

Always create tests after creating code and make sure all tests passed.

## Verification Plan

1. Check if tests are created after writing code.
2. Check if all tests passed.

## How to Run

1. Run `npm run test` to run tests.
2. Verify that all tests passed.

- **UI Testing**: When testing Next.js components, verify that they adhere to the base design system (e.g., shadcn/radix-ui) and do not introduce redundant styles.
