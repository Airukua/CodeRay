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
export const MAX_SCAN_FILES = 500;
export const MAX_FILE_BYTES = 1_048_576; // 1 MiB

function isInsideRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolves `filePaths` relative to `projectRoot` and rejects any path
 * (including symlinks) that escapes `projectRoot` or exceeds size limits.
 * If a valid path is a directory, recursively collects `.ts`, `.tsx`, and `.py` files.
 */
export async function resolveSandboxedPaths(
  filePaths: string[],
  projectRoot: string
): Promise<{ valid: string[]; rejected: string[] }> {
  const root = path.resolve(projectRoot);
  const realRoot = await fs.realpath(root).catch(() => root);
  const validSet = new Set<string>();
  const rejected: string[] = [];

  for (const fp of filePaths) {
    if (validSet.size >= MAX_SCAN_FILES) break;

    const resolved = path.isAbsolute(fp) ? path.resolve(fp) : path.resolve(root, fp);
    if (!isInsideRoot(root, resolved)) {
      rejected.push(fp);
      continue;
    }

    try {
      const realTarget = await fs.realpath(resolved);
      if (!isInsideRoot(realRoot, realTarget)) {
        rejected.push(fp);
        continue;
      }

      const stat = await fs.stat(realTarget);
      if (stat.isDirectory()) {
        await collectDirFiles(realTarget, realRoot, validSet);
      } else if (stat.size <= MAX_FILE_BYTES) {
        validSet.add(realTarget);
      } else {
        rejected.push(fp);
      }
    } catch {
      // Keep non-existent paths inside root so callers can handle or ignore gracefully
      validSet.add(resolved);
    }
  }

  return { valid: Array.from(validSet).slice(0, MAX_SCAN_FILES), rejected };
}

async function collectDirFiles(
  dir: string,
  realRoot: string,
  out: Set<string>
): Promise<void> {
  if (out.size >= MAX_SCAN_FILES) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.size >= MAX_SCAN_FILES) break;
    if (IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;

    const full = path.join(dir, entry.name);
    if (!isInsideRoot(realRoot, full)) continue;

    if (entry.isDirectory()) {
      await collectDirFiles(full, realRoot, out);
    } else if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.size <= MAX_FILE_BYTES) {
        out.add(full);
      }
    }
  }
}
