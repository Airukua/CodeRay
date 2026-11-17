import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FlowGraphPayload } from "@flowguard/shared";
import { analyzeTypeScript } from "./tsReactAnalyzer.js";
import { analyzePython } from "./pythonAnalyzer.js";
import { computeGraphDiff } from "./graphDiff.js";
import { detectContractMismatches } from "./contractMatcher.js";
import { resolveOneHopImports } from "./importResolver.js";

describe("Graph Diff, Contract Matcher & 1-Hop Import Resolver", () => {
  describe("given a previous graph and an updated graph", () => {
    const prev: FlowGraphPayload = {
      timestamp: "t1",
      projectRoot: "/repo",
      nodes: [
        {
          id: "n_keep",
          label: "Keep",
          category: "INPUT_GATE",
          language: "typescript",
          filePath: "a.ts",
          lineRange: [1, 1],
          codeSnippet: "const a = 1;",
        },
        {
          id: "n_mod",
          label: "Mod",
          category: "STATE_MACHINE",
          language: "typescript",
          filePath: "a.ts",
          lineRange: [2, 2],
          codeSnippet: "let s = 1;",
        },
        {
          id: "n_del",
          label: "Del",
          category: "OUTPUT_GATE",
          language: "typescript",
          filePath: "a.ts",
          lineRange: [3, 3],
          codeSnippet: "return s;",
        },
      ],
      edges: [],
    };

    const curr: FlowGraphPayload = {
      timestamp: "t2",
      projectRoot: "/repo",
      nodes: [
        prev.nodes[0],
        { ...prev.nodes[1], codeSnippet: "let s = 2;" },
        {
          id: "n_add",
          label: "Add",
          category: "OUTPUT_GATE",
          language: "typescript",
          filePath: "a.ts",
          lineRange: [4, 4],
          codeSnippet: "return 2;",
        },
      ],
      edges: [],
    };

    describe("when computeGraphDiff compares them", () => {
      it("identifies added, modified, removed, and unchanged nodes accurately", () => {
        const { diff, annotatedGraph } = computeGraphDiff(prev, curr);
        expect(diff.addedNodeIds).toEqual(["n_add"]);
        expect(diff.modifiedNodeIds).toEqual(["n_mod"]);
        expect(diff.removedNodeIds).toEqual(["n_del"]);
        expect(annotatedGraph.nodes.find((n) => n.id === "n_keep")?.diffStatus).toBe("unchanged");
      });
    });
  });

  describe("given a Next.js fetch mutation and a FastAPI Pydantic endpoint", () => {
    describe("when the payload fields mismatch the Pydantic schema", () => {
      it("reports a CROSS_BOUNDARY_CONTRACT_MISMATCH error", async () => {
        const tsRes = await analyzeTypeScript(
          `export function go() { return fetch("/api/process", { method: "POST", body: JSON.stringify({ userId: "1", wrongField: 2 }) }); }`,
          "src/client.ts",
          "typescript"
        );
        const pyRes = await analyzePython(
          `class OrderRequest(BaseModel):\n    user_id: str\n    amount: float\n\n@app.post("/api/process")\ndef process_order(req: OrderRequest):\n    return {"ok": True}\n`,
          "backend/api.py"
        );
        const violations = detectContractMismatches({
          timestamp: "now",
          projectRoot: "/repo",
          nodes: [...tsRes.nodes, ...pyRes.nodes],
          edges: [],
        });
        expect(violations).toHaveLength(1);
        expect(violations[0].ruleId).toBe("CROSS_BOUNDARY_CONTRACT_MISMATCH");
      });
    });

    describe("when the payload fields match the Pydantic schema 100%", () => {
      it("reports zero contract mismatch violations", async () => {
        const tsRes = await analyzeTypeScript(
          `export function go() { return fetch("/api/process", { method: "POST", body: JSON.stringify({ user_id: "1", amount: 50 }) }); }`,
          "src/client.ts",
          "typescript"
        );
        const pyRes = await analyzePython(
          `class OrderRequest(BaseModel):\n    user_id: str\n    amount: float\n\n@app.post("/api/process")\ndef process_order(req: OrderRequest):\n    return {"ok": True}\n`,
          "backend/api.py"
        );
        const violations = detectContractMismatches({
          timestamp: "now",
          projectRoot: "/repo",
          nodes: [...tsRes.nodes, ...pyRes.nodes],
          edges: [],
        });
        expect(violations).toHaveLength(0);
      });
    });
  });

  describe("given TypeScript files with circular local imports", () => {
    describe("when resolveOneHopImports resolves dependencies", () => {
      it("includes the imported file once without infinite recursion", async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fg-import-"));
        try {
          const fileA = path.join(tmpDir, "a.ts");
          const fileB = path.join(tmpDir, "b.ts");
          await fs.writeFile(fileA, `import { b } from "./b"; export const a = b;`);
          await fs.writeFile(fileB, `import { a } from "./a"; export const b = 1;`);

          const resolved = await resolveOneHopImports([fileA], tmpDir);
          expect(resolved).toHaveLength(2);
          expect(resolved).toContain(fileA);
          expect(resolved).toContain(fileB);
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      });
    });
  });
});
