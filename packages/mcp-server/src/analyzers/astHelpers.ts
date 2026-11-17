import type Parser from "web-tree-sitter";

export function walkAst(
  node: Parser.SyntaxNode,
  visitor: (n: Parser.SyntaxNode) => void
): void {
  visitor(node);
  for (const child of node.namedChildren) {
    walkAst(child, visitor);
  }
}

export function getSnippet(
  lines: string[],
  startRow: number,
  endRow: number,
  maxLines = 8
): string {
  const clampedEnd = Math.min(endRow, startRow + maxLines - 1, lines.length - 1);
  return lines.slice(startRow, clampedEnd + 1).join("\n").trim();
}

export function makeNodeId(
  prefix: string,
  filePath: string,
  row: number,
  name: string
): string {
  const cleanFile = filePath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const cleanName = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${prefix}_${cleanFile}_L${row + 1}_${cleanName}`.slice(0, 80);
}

export function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
