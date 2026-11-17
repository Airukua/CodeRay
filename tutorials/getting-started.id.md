# CodeRay MCP — Panduan Instalasi & Penggunaan (Bahasa Indonesia)

**CodeRay MCP** adalah server MCP *headless* berbasis AST (`stdio`) yang deterministik untuk **TypeScript, React/Next.js, dan Python**. Tool ini membantu AI coding agent melacak alur data, mendeteksi *implicit state leak*, memvalidasi kontrak lintas frontend-backend, serta memeriksa perubahan arsitektur hasil edit AI secara hemat token.

---

## 1. Build CodeRay Secara Lokal (Prasyarat)

```bash
git clone https://github.com/Airukua/CodeRay.git
cd CodeRay
pnpm install --config.strict-dep-builds=false
pnpm build
```

Entrypoint server MCP Anda berada di:

```text
/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js
```

> **Catatan Windows + WSL:** Jika IDE berjalan di Windows sementara CodeRay di-build di WSL, jalankan melalui `wsl` atau arahkan ke path WSL, lalu selalu kirim parameter `projectRoot` saat memindai project.

---

## 2. Cara Install di Berbagai Coding Agent

### Claude Code (CLI)
Tambahkan lewat CLI (disarankan):

```bash
claude mcp add coderay -- node /path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js
```

Atau tambahkan ke `.mcp.json` (project) / `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Cursor
Tambahkan ke `~/.cursor/mcp.json` (global) atau `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### VS Code (GitHub Copilot / Native MCP)
Tambahkan ke `.vscode/mcp.json` (memakai root key `"servers"`):

```json
{
  "servers": {
    "coderay": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

*(Atau gunakan `.mcp.json` di root project dengan `"mcpServers"` untuk kompatibilitas lintas harness.)*

### Windsurf
Tambahkan ke `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### OpenAI Codex CLI
Tambahkan ke `~/.codex/config.toml` (user) atau `.codex/config.toml` (project):

```toml
[mcp_servers.coderay]
enabled = true
command = "node"
args = ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
```

### Gemini CLI
Tambahkan ke `~/.gemini/settings.json` (user) atau `.gemini/settings.json` (project), lalu cek dengan `/mcp`:

```json
{
  "mcpServers": {
    "coderay": {
      "command": "node",
      "args": ["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Antigravity
Daftarkan `coderay` di menu **Manage MCP Servers**:
- **Command:** `node`
- **Args:** `["/path/absolut/ke/CodeRay/packages/mcp-server/dist/index.js"]`

Saat memindai project di workspace lain, selalu sertakan parameter `projectRoot` (path absolut project aktif).

---

## 3. Cara Menggunakan Tool CodeRay

### A. `scan_data_flow` — X-Ray AST Cepat & Hemat Token
Memetakan `INPUT_GATE` (beserta `inputFormat`), `STATE_MACHINE`, `IMPLICIT_WARNING`, dan `OUTPUT_GATE` (beserta `outputFormat` & `contract`).

**Tips hemat token:** Gunakan `categories` dan `limit` agar agent hanya mengambil node yang dibutuhkan.

```json
{
  "filePaths": ["src"],
  "projectRoot": "/path/absolut/ke/project-anda",
  "categories": ["INPUT_GATE", "STATE_MACHINE", "IMPLICIT_WARNING"],
  "limit": 30
}
```

**Contoh prompt ke agent:**
> "X-ray folder `src/` pakai CodeRay (`scan_data_flow` dengan `projectRoot`), fokus ke `INPUT_GATE`, `STATE_MACHINE`, dan `IMPLICIT_WARNING`, lalu buatkan diagram Mermaid alur datanya."

### B. `inspect_node_contract` — Inspeksi Detail Node Tertentu
Setelah `scan_data_flow`, periksa snippet dan kontrak hanya pada `nodeId` yang bermasalah tanpa membaca satu file penuh:

```json
{
  "nodeId": "warn_src_utils_io_py_L51_os_env"
}
```

### C. `validate_architecture_rules` — Audit Ketat Implicit State & Kontrak
Jalankan dengan `strictMode: true` untuk gagal otomatis jika ada `IMPLICIT_STATE_LEAK` atau `CROSS_BOUNDARY_CONTRACT_MISMATCH`:

```json
{
  "filePaths": ["src"],
  "projectRoot": "/path/absolut/ke/project-anda",
  "strictMode": true
}
```

### D. `check_architecture_drift` — Cek Perubahan Arsitektur Hasil Edit AI
Membandingkan AST baseline Git (`HEAD` secara default) vs working tree pada file TypeScript & Python untuk mendeteksi *implicit leak* baru, *input gate* yang terhapus, *AI-slop* (`any`, `@ts-ignore`, `# type: ignore`, fungsi terlalu panjang/kompleks), dan manipulasi file test (`.skip`, assertion dihapus), dengan output `riskTier` (`GREEN`/`YELLOW`/`RED`) dan oracle `passed`:

```json
{
  "projectRoot": "/path/absolut/ke/project-anda",
  "baseRef": "HEAD",
  "strictMode": true
}
```

**Contoh prompt ke agent:**
> "Jalankan `check_architecture_drift` dari CodeRay terhadap `HEAD` sebelum commit, dan perbaiki jika ada temuan `RED`."
