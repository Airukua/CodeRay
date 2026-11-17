import fs from "node:fs/promises";
import path from "node:path";

const TS_EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx"];

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveTsImport(baseDir: string, spec: string): Promise<string | null> {
  if (!spec.startsWith(".")) return null;
  const candidate = path.resolve(baseDir, spec);
  if (await fileExists(candidate)) return candidate;
  for (const ext of TS_EXTS) {
    if (await fileExists(candidate + ext)) return candidate + ext;
  }
  for (const ext of TS_EXTS) {
    const idx = path.join(candidate, `index${ext}`);
    if (await fileExists(idx)) return idx;
  }
  return null;
}

async function resolvePyImport(
  baseDir: string,
  projectRoot: string,
  moduleName: string
): Promise<string | null> {
  const parts = moduleName.replace(/^\.+/, "").split(".").filter(Boolean);
  if (parts.length === 0) return null;

  for (const root of [baseDir, projectRoot]) {
    const asFile = path.join(root, ...parts) + ".py";
    if (await fileExists(asFile)) return asFile;
    const asPkg = path.join(root, ...parts, "__init__.py");
    if (await fileExists(asPkg)) return asPkg;
  }
  return null;
}

/**
 * Resolves 1-hop local imports for `.ts`, `.tsx`, and `.py` files.
 */
export async function resolveOneHopImports(
  entryFiles: string[],
  projectRoot: string
): Promise<string[]> {
  const visited = new Set<string>(entryFiles.map((f) => path.resolve(f)));
  const result = Array.from(visited);

  for (const file of entryFiles) {
    const absFile = path.resolve(file);
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf-8");
    } catch {
      continue;
    }

    const baseDir = path.dirname(absFile);
    const ext = path.extname(absFile).toLowerCase();

    if (ext === ".py") {
      const pyImportRegex = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
      let match: RegExpExecArray | null;
      while ((match = pyImportRegex.exec(content)) !== null) {
        const mod = match[1] ?? match[2];
        if (!mod) continue;
        const resolved = await resolvePyImport(baseDir, projectRoot, mod);
        if (resolved && !visited.has(resolved)) {
          visited.add(resolved);
          result.push(resolved);
        }
      }
    } else {
      const tsImportRegex = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
      let match: RegExpExecArray | null;
      while ((match = tsImportRegex.exec(content)) !== null) {
        const spec = match[1];
        if (!spec) continue;
        const resolved = await resolveTsImport(baseDir, spec);
        if (resolved && !visited.has(resolved)) {
          visited.add(resolved);
          result.push(resolved);
        }
      }
    }
  }

  return result;
}
