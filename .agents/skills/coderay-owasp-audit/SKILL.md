---
name: coderay-owasp-audit
description: >-
  Run OWASP Top 10, MCP sandbox, and pnpm supply-chain security checks on this
  repository. Use when auditing path traversal/symlink guards, dependency
  vulnerabilities, CI workflow pinning, or preparing a security release.
---

# CodeRay OWASP & Supply-Chain Security Audit

Use this runbook to verify CodeRay's security posture before releases or after modifying file I/O, MCP tools, or CI workflows.

## 1. MCP Sandbox & OWASP Controls
- **A01 Broken Access Control (`packages/mcp-server/src/utils/pathGuard.ts`)**:
  - Confirm `resolveSandboxedPaths()` resolves `fs.realpath()` on both `projectRoot` and target paths to block symlink escapes.
  - Confirm `collectDirFiles()` skips `entry.isSymbolicLink()`.
- **A04 Insecure Design / DoS (`pathGuard.ts`)**:
  - Confirm `MAX_SCAN_FILES` (`500`) and `MAX_FILE_BYTES` (`1 MiB`) caps are enforced.
- **Cache Permissions (`packages/mcp-server/src/state.ts`)**:
  - Confirm graph cache writes to `~/.cache/coderay/last-graph.json` with `0o700` dir and `0o600` file permissions (never `/tmp` with a predictable filename).

## 2. Supply-Chain & CI Checks
- **pnpm Policy (`pnpm-workspace.yaml`)**:
  - Verify `blockExoticSubdeps: true`, `minimumReleaseAge: 10080`, and `trustPolicy: no-downgrade` remain enabled.
- **GitHub Actions Pinning (`.github/workflows/*.yml`)**:
  - Pin every `uses:` action to a full 40-character commit SHA (no mutable `@v4`/`@v3` tags) to satisfy Semgrep `github-actions-mutable-action-tag`.

## 3. Commands to Run
```bash
pnpm audit --prod --audit-level=high
pnpm install --frozen-lockfile --config.strict-dep-builds=false
pnpm test
```
Also run `validate_architecture_rules` with `strictMode: true` on `packages/mcp-server/src` and `packages/shared/src` to confirm `totalViolations: 0`.
