import type { SupportedLanguage } from "@flowguard/shared";
import { withParsedTree } from "./astEngine.js";
import { walkAst } from "./astHelpers.js";

export interface SlopWarning {
  ruleId: "TYPE_BYPASS" | "HIGH_COMPLEXITY" | "OVERSIZED_FUNCTION";
  filePath: string;
  line: number;
  symbol?: string;
  message: string;
}

export interface TestTamperFinding {
  ruleId: "TEST_SKIP_ADDED" | "EARLY_EXIT_IN_TEST" | "ASSERTIONS_REMOVED";
  filePath: string;
  line?: number;
  message: string;
}

const MAX_FUNCTION_LINES = 60;
const MAX_BRANCHES = 12;

const TS_BRANCH_TYPES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "ternary_expression",
]);

const PY_BRANCH_TYPES = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "while_statement",
  "case_clause",
  "except_clause",
  "conditional_expression",
]);

export function isTestFilePath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  const base = norm.split("/").pop() ?? norm;
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(base) ||
    /^test_.*\.py$/i.test(base) ||
    /_test\.py$/i.test(base)
  );
}

/**
 * Detects AI-slop patterns (type bypasses, oversized functions, high branching complexity)
 * using deterministic Tree-sitter AST traversal for TypeScript/TSX and Python.
 */
export async function analyzeSlopWarnings(
  code: string,
  filePath: string,
  language: SupportedLanguage
): Promise<SlopWarning[]> {
  return withParsedTree(code, language, (root) => {
    const warnings: SlopWarning[] = [];
    const seen = new Set<string>();
    const branchTypes = language === "python" ? PY_BRANCH_TYPES : TS_BRANCH_TYPES;

    const pushWarning = (w: SlopWarning) => {
      const key = `${w.ruleId}:${w.filePath}:${w.line}:${w.symbol ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push(w);
    };

    walkAst(root, (node) => {
      const line = node.startPosition.row + 1;

      // 1. Type bypasses
      if (node.type === "comment") {
        const text = node.text;
        if (
          language === "python"
            ? /#\s*type:\s*ignore\b/i.test(text)
            : /@(ts-ignore|ts-expect-error|ts-nocheck)\b/i.test(text)
        ) {
          pushWarning({
            ruleId: "TYPE_BYPASS",
            filePath,
            line,
            message: `Type-checker suppression comment detected (${text.trim().slice(0, 40)}).`,
          });
        }
      } else if (language !== "python" && node.type === "predefined_type" && node.text === "any") {
        pushWarning({
          ruleId: "TYPE_BYPASS",
          filePath,
          line,
          message: "Explicit 'any' type bypasses TypeScript type safety.",
        });
      }

      // 2. Oversized or overly complex functions
      const isFn =
        language === "python"
          ? node.type === "function_definition"
          : node.type === "function_declaration" ||
            node.type === "method_definition" ||
            node.type === "arrow_function";

      if (isFn) {
        const lineCount = node.endPosition.row - node.startPosition.row + 1;
        const fnName =
          node.childForFieldName("name")?.text ??
          (node.parent?.type === "variable_declarator"
            ? node.parent.childForFieldName("name")?.text
            : undefined);

        if (lineCount > MAX_FUNCTION_LINES) {
          pushWarning({
            ruleId: "OVERSIZED_FUNCTION",
            filePath,
            line,
            symbol: fnName,
            message: `Function${fnName ? ` '${fnName}'` : ""} is ${lineCount} lines (max ${MAX_FUNCTION_LINES}).`,
          });
        }

        let branches = 0;
        walkAst(node, (inner) => {
          if (inner !== node && branchTypes.has(inner.type)) {
            branches++;
          }
        });

        if (branches > MAX_BRANCHES) {
          pushWarning({
            ruleId: "HIGH_COMPLEXITY",
            filePath,
            line,
            symbol: fnName,
            message: `Function${fnName ? ` '${fnName}'` : ""} has ${branches} control-flow branches (max ${MAX_BRANCHES}).`,
          });
        }
      }
    });

    return warnings;
  });
}

function countAssertions(code: string, language: SupportedLanguage): number {
  if (language === "python") {
    const matches = code.match(/\bassert\b|\bself\.assert[A-Z]\w*\s*\(/g);
    return matches ? matches.length : 0;
  }
  const matches = code.match(/\bexpect\s*\(|\bassert\.\w+\s*\(/g);
  return matches ? matches.length : 0;
}

function countSkips(code: string, language: SupportedLanguage): number {
  if (language === "python") {
    const matches = code.match(/@(?:unittest|pytest\.mark)\.skip(?:If|Unless)?\b/g);
    return matches ? matches.length : 0;
  }
  const matches = code.match(/\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(/g);
  return matches ? matches.length : 0;
}

/**
 * Compares test file before vs after to catch reward-hacking (added skips, early exits,
 * or removed assertions).
 */
export function detectTestTampering(
  beforeCode: string | null,
  afterCode: string,
  filePath: string,
  language: SupportedLanguage
): TestTamperFinding[] {
  const findings: TestTamperFinding[] = [];

  const beforeSkips = beforeCode ? countSkips(beforeCode, language) : 0;
  const afterSkips = countSkips(afterCode, language);
  if (afterSkips > beforeSkips) {
    findings.push({
      ruleId: "TEST_SKIP_ADDED",
      filePath,
      message: `Test file added ${afterSkips - beforeSkips} skip/only directive(s).`,
    });
  }

  const exitPattern = language === "python" ? /\bsys\.exit\s*\(\s*0\s*\)/ : /\bprocess\.exit\s*\(\s*0\s*\)/;
  if (exitPattern.test(afterCode) && !(beforeCode && exitPattern.test(beforeCode))) {
    findings.push({
      ruleId: "EARLY_EXIT_IN_TEST",
      filePath,
      message: "Early exit(0) introduced inside test file.",
    });
  }

  if (beforeCode !== null) {
    const beforeAsserts = countAssertions(beforeCode, language);
    const afterAsserts = countAssertions(afterCode, language);
    if (afterAsserts < beforeAsserts) {
      findings.push({
        ruleId: "ASSERTIONS_REMOVED",
        filePath,
        message: `Test assertions decreased from ${beforeAsserts} to ${afterAsserts}.`,
      });
    }
  }

  return findings;
}
