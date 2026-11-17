import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".venv",
  "__pycache__",
  ".next",
  "coverage",
]);

const SUPPORTED_EXTS = new Set([".ts", ".tsx", ".mts", ".cts", ".py"]);

/**
 * Resolves `filePaths` relative to `projectRoot` and rejects any path
 * that escapes `projectRoot` (path traversal guard).
 * If a valid path is a directory, recursively collects `.ts`, `.tsx`, and `.py` files.
 */
export async function resolveSandboxedPaths(
  filePaths: string[],
  projectRoot: string
): Promise<{ valid: string[]; rejected: string[] }> {
  const root = path.resolve(projectRoot);
  const validSet = new Set<string>();
  const rejected: string[] = [];

  for (const fp of filePaths) {
    const resolved = path.isAbsolute(fp) ? path.resolve(fp) : path.resolve(root, fp);
    const rel = path.relative(root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      rejected.push(fp);
      continue;
    }

    try {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        await collectDirFiles(resolved, validSet);
      } else {
        validSet.add(resolved);
      }
    } catch {
      // Keep non-existent paths inside root so callers can handle or ignore gracefully
      validSet.add(resolved);
    }
  }

  return { valid: Array.from(validSet), rejected };
}

async function collectDirFiles(dir: string, out: Set<string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectDirFiles(full, out);
    } else if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.add(full);
    }
  }
}
