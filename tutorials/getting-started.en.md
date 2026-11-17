# CodeRay MCP — Installation & Usage Guide (English)

**CodeRay MCP** is a headless, deterministic AST analyzer (`stdio` MCP server) for **TypeScript, React/Next.js, and Python**. It helps AI coding agents trace data flow, detect implicit state leaks, validate cross-boundary contracts, and catch AI-introduced architectural drift with minimal token usage.

---

## 1. Build CodeRay Locally (Prerequisite)

```bash
git clone https://github.com/Airukua/CodeRay.git
cd CodeRay
pnpm install --config.strict-dep-builds=false
pnpm build
```

Your MCP server entrypoint is:

```text
/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js
```

> **Windows + WSL Note:** If your IDE runs on Windows and CodeRay is built inside WSL, run `wsl` as the command or point to the Linux path inside WSL (and pass `projectRoot` when scanning).

---

## 2. Install in Coding Agents

### Claude Code (CLI)
Add via CLI (recommended):

```bash
claude mcp add coderay -- node /absolute/path/to/CodeRay/packages/mcp-server/dist/index.js
```

Or add to `.mcp.json` (project) / `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Cursor
Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### VS Code (GitHub Copilot / Native MCP)
Add to `.vscode/mcp.json` (uses `"servers"` root key):

```json
{
  "servers": {
    "coderay": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

*(Or use `.mcp.json` at project root with `"mcpServers"` for portable Copilot/CLI harnesses.)*

### Windsurf
Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### OpenAI Codex CLI
Add to `~/.codex/config.toml` (user) or `.codex/config.toml` (project):

```toml
[mcp_servers.coderay]
enabled = true
command = "node"
args = ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
```

### Gemini CLI
Add to `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project), then verify with `/mcp`:

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Antigravity
Register `coderay` in **Manage MCP Servers** with:
- **Command:** `node`
- **Args:** `["/absolute/path/to/CodeRay/packages/mcp-server/dist/index.js"]`

When scanning another workspace, always pass `projectRoot` (the absolute path of your active project) to CodeRay tools.

---

## 3. How to Use CodeRay Tools

### A. `scan_data_flow` — Fast, Targeted AST X-Ray
Use this to map `INPUT_GATE` (with `inputFormat`), `STATE_MACHINE`, `IMPLICIT_WARNING`, and `OUTPUT_GATE` (with `outputFormat` & `contract`).

**Token-saving tip:** Pass `categories` and `limit` so the agent doesn't dump hundreds of irrelevant nodes into context.

```json
{
  "filePaths": ["src"],
  "projectRoot": "/absolute/path/to/your-project",
  "categories": ["INPUT_GATE", "STATE_MACHINE", "IMPLICIT_WARNING"],
  "limit": 30
}
```

**Prompt example:**
> "Use CodeRay `scan_data_flow` on `src/` (pass `projectRoot`) focusing on `INPUT_GATE`, `STATE_MACHINE`, and `IMPLICIT_WARNING`, then draw a clean Mermaid diagram of the data flow."

### B. `inspect_node_contract` — Deep Inspection on Demand
After `scan_data_flow`, inspect only the specific `nodeId` you care about without reading the entire file:

```json
{
  "nodeId": "warn_src_utils_io_py_L51_os_env"
}
```

### C. `validate_architecture_rules` — Strict Implicit-State & Contract Audit
Run in `strictMode: true` to fail if any `IMPLICIT_STATE_LEAK` or `CROSS_BOUNDARY_CONTRACT_MISMATCH` exists:

```json
{
  "filePaths": ["src"],
  "projectRoot": "/absolute/path/to/your-project",
  "strictMode": true
}
```

### D. `check_architecture_drift` — Verify AI-Edited Code Against Git
Compares Git baseline AST (`HEAD` by default) vs current working tree across TypeScript and Python, returning a `GREEN` / `YELLOW` / `RED` risk tier, `passed` oracle, new implicit leaks, removed input gates, AI-slop complexity/type-bypasses, and test-tampering checks:

```json
{
  "projectRoot": "/absolute/path/to/your-project",
  "baseRef": "HEAD",
  "strictMode": true
}
```

**Prompt example:**
> "Run CodeRay `check_architecture_drift` against `HEAD` before we commit, and fix any `RED` findings."
