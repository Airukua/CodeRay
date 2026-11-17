---
name: coderay-xray
description: >-
  Run a clean, noise-free CodeRay X-Ray analysis on a codebase. Use whenever the
  user asks to X-ray, scan data flow, audit implicit state, or visualize
  architecture with CodeRay MCP—teaches which files to exclude from analysis
  and how to synthesize an end-to-end grouped flow story.
---

# CodeRay X-Ray Workflow & File Exclusion Guide

When the user asks to **X-ray** a folder or codebase using CodeRay, do **not** blindly pass every file into `scan_data_flow`. Filter out non-essential, generated, and test/mock files first so the analysis stays fast, accurate, and free of noise.

## 1. Files & Directories to Exclude from Analysis

Skip the following paths unless the user explicitly asks to audit them:

- **Build artifacts & dependencies**:
  - `node_modules/`, `dist/`, `build/`, `.next/`, `out/`, `coverage/`, `.turbo/`, `.venv/`, `__pycache__/`, `.git/`
- **Tests, chaos suites, & mock/demo data**:
  - `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`, `*.bdd.test.ts`, `*.chaos.bdd.test.ts`
  - `test/`, `tests/`, `__tests__/`, `chaos/`, `mocks/`, `fixtures/`, `mockGraph.ts`
- **Type declarations & tooling/config files**:
  - `*.d.ts`, `*.config.ts`, `*.config.js`, `*.config.mjs`, `tsconfig*.json`, `package.json`, `.oxlintrc.json`
- **Non-executable assets**:
  - `*.md`, `*.css`, `*.scss`, `*.svg`, `*.png`, `*.json`, `*.yaml`, `*.yml`

> **Tip:** Focus on production runtime entrypoints, schemas/contracts, state hooks/stores, API handlers, analyzers, and WebSocket/DB boundaries (`.ts`, `.tsx`, `.py`).

## 2. Step-by-Step X-Ray Workflow

1. **Discover & Filter Targets**
   - List `.ts`, `.tsx`, and `.py` files in the target directory, excluding the patterns in Section 1.
2. **Run Deterministic AST Scan & Rule Audit**
   - Call `scan_data_flow` with the filtered `filePaths` and explicit `projectRoot` (absolute workspace path).
   - Call `validate_architecture_rules` on the same filtered `filePaths` and `projectRoot` to catch `IMPLICIT_STATE_LEAK` and cross-boundary contract mismatches.
3. **Inspect Key Nodes for Context**
   - Use `inspect_node_contract` (or read the relevant lines) on key Input Gates, State Machines, Implicit Warnings, and Output Gates to understand how data actually flows between files.
4. **Publish an End-to-End Grouped Story**
   - Call `publish_flow_story` to present the complete journey from **User / Client Request -> Input Gate (explicit `inputFormat`) -> Internal Processing / State / Warnings -> Final Output**:
     - Set `group` on every node (e.g., `"Stage 1: Input & Validation"`, `"Stage 2: Core Logic / AST"`, `"Stage 3: State & Transport"`, `"Stage 4: Output / UI"`) so the Visualizer UI renders clean stage containers without tangled lines.
     - Set `stepOrder` (`1, 2, 3...`), `inputFormat` on `INPUT_GATE` nodes (e.g., `"HTTP POST JSON"`, `"MCP Tool Args (Zod)"`, `"React Props"`), and a concise 1-sentence `description` per node.
5. **Report Findings Clearly**
   - Summarize the scanned scope, any `IMPLICIT_STATE_LEAK` or contract mismatches with file/line links, and provide the Visualizer UI link (`http://localhost:4123`).
