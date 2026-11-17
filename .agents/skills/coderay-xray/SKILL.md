---
name: coderay-xray
description: >-
  Run a clean, noise-free CodeRay X-Ray analysis on a codebase. Use whenever the
  user asks to X-ray, scan data flow, audit implicit state, or visualize
  architecture with CodeRay MCP—teaches which files to exclude from analysis
  and how to render an end-to-end Mermaid flowchart directly in the agent harness.
---

# CodeRay X-Ray Workflow (Headless MCP + Mermaid)

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

> **Tip:** Focus on production runtime entrypoints, schemas/contracts, state hooks/stores, API handlers, analyzers, and DB/external boundaries (`.ts`, `.tsx`, `.py`).

## 2. Step-by-Step X-Ray Workflow

1. **Discover & Filter Targets**
   - List `.ts`, `.tsx`, and `.py` files in the target directory, excluding the patterns in Section 1.
2. **Run Targeted, Token-Efficient AST Scan & Rule Audit**
   - Call `scan_data_flow` with the filtered `filePaths`, explicit `projectRoot` (absolute workspace path), `categories` (e.g. `["INPUT_GATE", "STATE_MACHINE", "IMPLICIT_WARNING"]` when auditing state/leaks), and a tight `limit` (e.g. `20–50`) to minimize token consumption.
   - Call `validate_architecture_rules` (`strictMode: true` when strict auditing is desired) on the same targets to catch `IMPLICIT_STATE_LEAK` and cross-boundary contract mismatches.
3. **Inspect Flagged Nodes & Critical Boundaries**
   - Use `inspect_node_contract` only on flagged warnings or key nodes instead of reading every raw file.
   - Only read raw source lines on critical state/orchestration files when checking subtle semantic patterns not yet covered by AST rules (such as property mutations on `const` object containers or ambient clock calls).
4. **Render Detailed Mermaid Diagram in the Agent Harness**
   - Present a clean `flowchart LR` Mermaid block directly in your response (or artifact):
     - Group stages with `subgraph` (e.g., `Input & Validation`, `State Machine & Guards`, `Implicit State / Leaks`, `Output`).
     - Specify **input format/contract** clearly on entry nodes (e.g., `HTTP POST JSON`, `MCP Tool Args (Zod)`, `PNG Grayscale 224x224`).
     - Model **detailed internal state transitions, routing guards, caches, and every `IMPLICIT_WARNING`** inline where it occurs (using dashed edges `-.->` and distinct red styling).
     - Quote all node/subgraph labels containing parentheses or special characters (`id["Label (Extra Info)"]`) and avoid HTML tags inside Mermaid labels.
5. **Report Findings Clearly**
   - Summarize the scanned scope and any `IMPLICIT_STATE_LEAK` or contract mismatches with clickable file/line links.
