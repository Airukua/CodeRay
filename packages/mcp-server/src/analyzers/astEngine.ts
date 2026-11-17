import { createRequire } from "node:module";
import path from "node:path";
import Parser from "web-tree-sitter";
import type { SupportedLanguage } from "@flowguard/shared";

const require = createRequire(import.meta.url);

const WASM_FILES: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-wasms/out/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-wasms/out/tree-sitter-tsx.wasm",
  python: "tree-sitter-wasms/out/tree-sitter-python.wasm",
};

let initPromise: Promise<void> | null = null;
const languageCache = new Map<SupportedLanguage, Parser.Language>();

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init();
  }
  await initPromise;
}

async function getLanguage(lang: SupportedLanguage): Promise<Parser.Language> {
  const cached = languageCache.get(lang);
  if (cached) return cached;

  await ensureInitialized();
  const wasmPath = require.resolve(WASM_FILES[lang]);
  const loaded = await Parser.Language.load(wasmPath);
  languageCache.set(lang, loaded);
  return loaded;
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") return "typescript";
  if (ext === ".tsx" || ext === ".jsx") return "tsx";
  if (ext === ".py") return "python";
  return null;
}

/**
 * Parses source code with web-tree-sitter and guarantees `tree.delete()`
 * is called in a `finally` block to prevent WASM heap leaks.
 */
export async function withParsedTree<T>(
  code: string,
  language: SupportedLanguage,
  fn: (rootNode: Parser.SyntaxNode) => T
): Promise<T> {
  const lang = await getLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(code);
  try {
    return fn(tree.rootNode);
  } finally {
    tree.delete();
    parser.delete();
  }
}
