# CLAUDE.md — Aturan Koding Ketat FlowGuard MCP

1. **Strict `stdout` Hygiene (MCP Server):**
   - `StdioServerTransport` menggunakan `stdout` untuk komunikasi JSON-RPC 2.0.
   - **DILARANG** menggunakan `console.log()` di `packages/mcp-server`. Selalu gunakan `console.error()` untuk logging.
2. **Single Source of Truth (`packages/shared`):**
   - Semua skema graf (`FlowNode`, `FlowEdge`, `FlowGraphPayload`, `GraphDiff`, dan pesan WebSocket) harus didefinisikan di `packages/shared/src/schema.ts` dengan Zod.
3. **WASM Memory Safety (`web-tree-sitter`):**
   - Setiap pemanggilan `parser.parse()` wajib diakhiri dengan `tree.delete()` di blok `try/finally` agar memori WASM tidak bocor.
4. **Path Sandboxing:**
   - Semua path dari MCP tool wajib dinormalisasi dan divalidasi terhadap `projectRoot` lewat `pathGuard.ts`.
5. **Verifikasi Wajib:**
   - Jalankan `pnpm -r typecheck && pnpm -r build && pnpm -r test` setiap selesai mengubah kode.
