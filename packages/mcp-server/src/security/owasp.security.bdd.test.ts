import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatGraphAsMermaid } from "../analyzers/mermaidFormatter.js";
import { MAX_FILE_BYTES, resolveSandboxedPaths } from "../utils/pathGuard.js";

describe("OWASP Security & Sandbox Assurance", () => {
  let tmpRoot: string;
  let outsideDir: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coderay-sec-root-"));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "coderay-sec-outside-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  describe("A01: Broken Access Control — Path Traversal & Symlink Escape", () => {
    it("rejects relative and absolute paths outside projectRoot", async () => {
      const outsideFile = path.join(outsideDir, "secret.ts");
      await fs.writeFile(outsideFile, "export const secret = 1;");

      const res = await resolveSandboxedPaths(
        ["../../etc/passwd", outsideFile],
        tmpRoot
      );
      expect(res.valid).toEqual([]);
      expect(res.rejected).toHaveLength(2);
    });

    it("rejects symlinks inside projectRoot that point outside projectRoot", async () => {
      const outsideSecret = path.join(outsideDir, "secret.ts");
      await fs.writeFile(outsideSecret, "export const apiKey = 'sk-test';");

      const symlinkPath = path.join(tmpRoot, "escape.ts");
      await fs.symlink(outsideSecret, symlinkPath);

      const res = await resolveSandboxedPaths(["escape.ts"], tmpRoot);
      expect(res.valid).toEqual([]);
      expect(res.rejected).toEqual(["escape.ts"]);
    });

    it("skips symlinks during recursive directory traversal", async () => {
      const outsideSecret = path.join(outsideDir, "leak.ts");
      await fs.writeFile(outsideSecret, "export const x = 1;");
      await fs.symlink(outsideSecret, path.join(tmpRoot, "linked.ts"));

      const safeFile = path.join(tmpRoot, "safe.ts");
      await fs.writeFile(safeFile, "export const ok = true;");

      const res = await resolveSandboxedPaths(["."], tmpRoot);
      expect(res.valid).toHaveLength(1);
      expect(res.valid[0]).toContain("safe.ts");
    });
  });

  describe("A04: Insecure Design / DoS — File Size Caps", () => {
    it("rejects files exceeding MAX_FILE_BYTES", async () => {
      const hugeFile = path.join(tmpRoot, "huge.ts");
      await fs.writeFile(hugeFile, "a".repeat(MAX_FILE_BYTES + 1024));

      const res = await resolveSandboxedPaths(["huge.ts"], tmpRoot);
      expect(res.valid).toEqual([]);
      expect(res.rejected).toEqual(["huge.ts"]);
    });
  });

  describe("A03: Injection — Mermaid Label Sanitization", () => {
    it("neutralizes Mermaid syntax breakouts and HTML/script tags in labels", () => {
      const mermaid = formatGraphAsMermaid({
        timestamp: new Date().toISOString(),
        projectRoot: tmpRoot,
        nodes: [
          {
            id: "n1",
            label: 'Evil"]; click n1 "javascript:alert(1)" <script>',
            category: "IMPLICIT_WARNING",
            language: "typescript",
            filePath: "src/evil.ts",
            lineRange: [1, 1],
            schemaOrType: "a --> b; c | d",
            codeSnippet: "",
          },
        ],
        edges: [],
      });

      expect(mermaid).not.toContain('"];');
      expect(mermaid).not.toContain("<script>");
      expect(mermaid).not.toContain("-->");
    });
  });
});
