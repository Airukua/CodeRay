# Contributing to CodeRay MCP

Thank you for your interest in contributing to **CodeRay MCP**! We welcome bug reports, new AST detection patterns, visualizer improvements, and documentation updates.

## Development Setup

1. **Fork & Clone** the repository.
2. **Install dependencies** (requires Node.js `>= 20` and `pnpm >= 10`):
   ```bash
   pnpm install --config.strict-dep-builds=false
   ```
3. **Build all packages** (`shared`, `visualizer-ui`, `mcp-server`):
   ```bash
   pnpm build
   ```

## Coding Rules

- **Strict `stdout` Hygiene:** `StdioServerTransport` reserves `stdout` for JSON-RPC 2.0 frames. Never use `console.log()` in `packages/mcp-server` — always use `console.error()` (`stderr`).
- **Single Source of Truth:** All shared schemas (`FlowNode`, `FlowEdge`, `FlowGraphPayload`, WebSocket messages) live in `packages/shared/src/schema.ts` using Zod v4.
- **WASM Memory Safety:** Every `web-tree-sitter` parse must call `tree.delete()` and `parser.delete()` in a `finally` block.
- **Zero Warnings:** All code must pass `oxlint --deny-warnings` and `tsc --noEmit`.

## Verification Checklist Before Submitting a PR

Run the full quality suite locally (pre-commit hooks will also run `lint-staged` and `typecheck`):

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## Pull Request Process

1. Create a descriptive branch (`feat/python-async-detector`, `fix/ws-reconnect`).
2. Add or update **BDD tests** (`*.bdd.test.ts`) for any new AST rules or MCP tool behavior.
3. Ensure all CI checks pass on GitHub Actions.
