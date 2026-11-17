import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { analyzeTypeScript } from "../analyzers/tsReactAnalyzer.js";
import { serverState } from "../state.js";
import { handleScanDataFlow } from "../tools/scanFlow.js";
import { handleValidateArchitectureRules } from "../tools/validateRules.js";
import { startVisualizerServer } from "../ws-server.js";

describe("Chaos Engineering & System Resilience", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fg-chaos-"));
    serverState.projectRoot = tmpDir;
    serverState.currentGraph = null;
    serverState.previousGraph = null;
    serverState.activeUiSelection = null;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("given corrupted binary files, missing files, and valid files mixed together", () => {
    describe("when scan_data_flow processes the mixed batch", () => {
      it("survives binary garbage and missing files while still extracting valid nodes", async () => {
        const binaryFile = path.join(tmpDir, "corrupt.ts");
        const validFile = path.join(tmpDir, "valid.ts");
        await fs.writeFile(binaryFile, Buffer.from([0x00, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47]));
        await fs.writeFile(
          validFile,
          `export async function POST(req: Request) { const k = process.env.KEY; return Response.json({ ok: !!k }); }`
        );

        const res = await handleScanDataFlow({
          filePaths: ["corrupt.ts", "does_not_exist.ts", "valid.ts"],
        });

        expect(res.isError).toBeUndefined();
        const summary = JSON.parse(res.content[0].text);
        expect(summary.counts.inputGates).toBe(1);
        expect(summary.counts.implicitWarnings).toBe(1);
        expect(summary.counts.outputGates).toBe(1);
      });
    });
  });

  describe("given a pathological large file (5,000 lines) parsed repeatedly", () => {
    describe("when analyzeTypeScript runs 15 consecutive iterations", () => {
      it("completes without WASM OOM or memory/stack crash", async () => {
        const lines = Array.from(
          { length: 5000 },
          (_, i) => `const v${i} = ${i};`
        ).join("\n");
        const code = `${lines}\nexport const leak = () => process.env.PORT;\n`;

        for (let i = 0; i < 15; i++) {
          const res = await analyzeTypeScript(code, "large.ts", "typescript");
          expect(res.nodes.some((n) => n.category === "IMPLICIT_WARNING")).toBe(true);
        }
      });
    });
  });

  describe("given a storm of concurrent MCP tool invocations", () => {
    describe("when 10 parallel scan_data_flow and validate_architecture_rules calls fire at once", () => {
      it("handles all concurrent requests cleanly without race-condition crashes", async () => {
        const target = path.join(tmpDir, "concurrent.ts");
        await fs.writeFile(
          target,
          `export function GET() { return Response.json({ env: process.env.NODE_ENV }); }`
        );

        const tasks = Array.from({ length: 10 }, (_, idx) =>
          idx % 2 === 0
            ? handleScanDataFlow({ filePaths: ["concurrent.ts"], includeDiff: true })
            : handleValidateArchitectureRules({ filePaths: ["concurrent.ts"], strictMode: true })
        );

        const results = await Promise.all(tasks);
        expect(results).toHaveLength(10);
        for (const r of results) {
          expect(r.isError).toBeUndefined();
        }
      });
    });
  });

  describe("given port exhaustion (EADDRINUSE) and hostile WebSocket frames", () => {
    it("falls back to the next available port when preferred port is occupied", async () => {
      const blocker = http.createServer();
      await new Promise<void>((resolve) => blocker.listen(4180, "127.0.0.1", resolve));

      try {
        const boundPort = await startVisualizerServer(4180);
        expect(boundPort).toBe(4181);
      } finally {
        blocker.close();
      }
    });

    it("ignores malformed/hostile WebSocket payloads and still accepts valid UI_SELECTION afterward", async () => {
      const port = await startVisualizerServer(4190);
      expect(port).not.toBeNull();

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));

      ws.send("{not valid json!!!");
      ws.send(JSON.stringify({ type: "UNKNOWN_TYPE", payload: 12345 }));
      ws.send(JSON.stringify({ type: "UI_SELECTION", payload: { invalidField: true } }));

      ws.send(
        JSON.stringify({
          type: "UI_SELECTION",
          payload: {
            selectedNodeId: "chaos_node_1",
            userNote: "Survived chaos!",
            timestamp: new Date().toISOString(),
          },
        })
      );

      // Give the event loop a brief moment to process the WebSocket frames
      await new Promise((r) => setTimeout(r, 60));
      ws.close();

      expect(serverState.activeUiSelection?.selectedNodeId).toBe("chaos_node_1");
      expect(serverState.activeUiSelection?.userNote).toBe("Survived chaos!");
    });
  });
});
