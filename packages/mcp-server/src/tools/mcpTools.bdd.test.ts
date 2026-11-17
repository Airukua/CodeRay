import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serverState } from "../state.js";
import { handleScanDataFlow } from "../tools/scanFlow.js";
import { handleInspectNodeContract } from "../tools/inspectNode.js";
import { handleValidateArchitectureRules } from "../tools/validateRules.js";

describe("FlowGuard MCP Tools End-to-End", () => {
  let tmpDir: string;
  let sampleTsFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fg-mcp-"));
    serverState.projectRoot = tmpDir;
    serverState.currentGraph = null;
    serverState.previousGraph = null;

    sampleTsFile = path.join(tmpDir, "handler.ts");
    await fs.writeFile(
      sampleTsFile,
      `
      import { NextResponse } from "next/server";
      export async function POST(req: Request) {
        const secret = process.env.SECRET_TOKEN;
        return NextResponse.json({ ok: Boolean(secret) });
      }
      `
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("given a valid project file with an implicit process.env leak", () => {
    describe("when scan_data_flow and inspect_node_contract are called", () => {
      it("scans the file, caches nodes, and returns full contract details on inspect", async () => {
        const scanRes = await handleScanDataFlow({ filePaths: ["handler.ts"] });
        expect(scanRes.isError).toBeUndefined();

        const summary = JSON.parse(scanRes.content[0].text);
        expect(summary.counts.inputGates).toBe(1);
        expect(summary.counts.implicitWarnings).toBe(1);
        expect(summary.counts.outputGates).toBe(1);

        const warnId = summary.implicitWarnings[0].nodeId;
        const inspectRes = await handleInspectNodeContract({ nodeId: warnId });
        expect(inspectRes.isError).toBeUndefined();
        const inspected = JSON.parse(inspectRes.content[0].text);
        expect(inspected.node.id).toBe(warnId);
        expect(inspected.outgoingEdges.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe("when validate_architecture_rules runs in normal vs strictMode", () => {
      it("passes with warnings when strictMode is false, and fails when strictMode is true", async () => {
        const normal = await handleValidateArchitectureRules({
          filePaths: ["handler.ts"],
          strictMode: false,
        });
        const normalJson = JSON.parse(normal.content[0].text);
        expect(normalJson.passed).toBe(true);
        expect(normalJson.totalViolations).toBe(1);

        const strict = await handleValidateArchitectureRules({
          filePaths: ["handler.ts"],
          strictMode: true,
        });
        const strictJson = JSON.parse(strict.content[0].text);
        expect(strictJson.passed).toBe(false);
        expect(strictJson.violations[0].severity).toBe("error");
      });
    });
  });

  describe("given edge cases and security boundaries", () => {
    describe("when scan_data_flow receives a path traversal attempt (../../etc/passwd)", () => {
      it("rejects the path and returns isError = true", async () => {
        const res = await handleScanDataFlow({ filePaths: ["../../etc/passwd"] });
        expect(res.isError).toBe(true);
        const body = JSON.parse(res.content[0].text);
        expect(body.rejected).toContain("../../etc/passwd");
      });
    });

    describe("when inspect_node_contract is called before any scan or with an unknown ID", () => {
      it("returns a helpful error response", async () => {
        const beforeScan = await handleInspectNodeContract({ nodeId: "missing" });
        expect(beforeScan.isError).toBe(true);

        await handleScanDataFlow({ filePaths: ["handler.ts"] });
        const unknownId = await handleInspectNodeContract({ nodeId: "non_existent" });
        expect(unknownId.isError).toBe(true);
        expect(JSON.parse(unknownId.content[0].text).availableNodeIds.length).toBeGreaterThan(0);
      });
    });

    describe("when scan_data_flow generates a Mermaid diagram", () => {
      it("returns a flowchart LR diagram with subgraphs and classDef styles", async () => {
        const scanRes = await handleScanDataFlow({ filePaths: ["handler.ts"] });
        const json = JSON.parse(scanRes.content[0].text);
        expect(json.mermaid).toContain("flowchart LR");
        expect(json.mermaid).toContain("subgraph");
        expect(json.mermaid).toContain("classDef implicitWarning");

        const noMermaidRes = await handleScanDataFlow({
          filePaths: ["handler.ts"],
          includeMermaid: false,
        });
        expect(JSON.parse(noMermaidRes.content[0].text).mermaid).toBeUndefined();
      });
    });
  });
});
