---
name: coderay-analyzer-dev
description: >-
  Guide for extending or fixing CodeRay's Tree-sitter AST analyzers (TypeScript,
  React, Python), cross-boundary contract matcher, and Zod schemas. Use when
  adding new detection rules, fixing false positives, or updating MCP tool
  contracts in this repository.
---

# CodeRay AST Analyzer Development Guide

Follow this checklist whenever you modify `packages/shared` or `packages/mcp-server/src/analyzers/`:

## 1. Schema & Build Order
- Shared Zod v4 schemas live in `packages/shared/src/schema.ts`.
- After editing `packages/shared`, **always rebuild `@flowguard/shared` first** (`pnpm --filter @flowguard/shared build`) so `packages/mcp-server` picks up updated `.d.ts` and runtime schemas.

## 2. AST Rule Hygiene (`tsReactAnalyzer.ts` & `pythonAnalyzer.ts`)
- **Scoped edges**: Attach `metadata.scopeName` (e.g. `ComponentName` or `ClassName.method`) so intra-file `addEdge` connects nodes within the same scope instead of creating a Cartesian spiderweb across unrelated functions.
- **Deterministic IDs**: Always generate node IDs via `makeNodeId(prefix, filePath, row, tag)` from `astHelpers.ts`.
- **Minimize false positives**: Exclude non-DB `.delete()` / cleanup calls (e.g., Tree-sitter `tree.delete()`, `Set.delete()`) from `DB Write` output gates.
- **Tree-sitter memory safety**: Always parse through `withParsedTree()` in `astEngine.ts` so `tree.delete()` and `parser.delete()` run in `finally` blocks (preventing WASM OOM).

## 3. Verification Checklist
1. Add or update BDD tests in:
   - `packages/mcp-server/src/analyzers/tsReactAnalyzer.bdd.test.ts`
   - `packages/mcp-server/src/analyzers/pythonAnalyzer.bdd.test.ts`
   - `packages/mcp-server/src/analyzers/graphAndContracts.bdd.test.ts`
2. Run the full verification pipeline:
   ```bash
   pnpm build && pnpm typecheck && pnpm lint && pnpm test
   ```
3. Remind the user to reload/restart the `coderay` MCP server if `packages/mcp-server/dist/` changed.
