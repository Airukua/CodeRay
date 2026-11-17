import path from "node:path";

/**
 * Resolves `filePaths` relative to `projectRoot` and rejects any path
 * that escapes `projectRoot` (path traversal guard).
 */
export function resolveSandboxedPaths(
  filePaths: string[],
  projectRoot: string
): { valid: string[]; rejected: string[] } {
  const root = path.resolve(projectRoot);
  const valid: string[] = [];
  const rejected: string[] = [];

  for (const fp of filePaths) {
    const resolved = path.isAbsolute(fp) ? path.resolve(fp) : path.resolve(root, fp);
    const rel = path.relative(root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      rejected.push(fp);
    } else {
      valid.push(resolved);
    }
  }

  return { valid, rejected };
}
