import type { FlowEdge, FlowNode, SupportedLanguage } from "@flowguard/shared";
import { withParsedTree } from "./astEngine.js";
import { dedupeStrings, getSnippet, makeNodeId, walkAst } from "./astHelpers.js";

const NEXT_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const STATE_HOOKS = new Set(["useState", "useReducer", "useContext", "useStore", "useSelector"]);
const NON_DB_DELETE_RECEIVERS = /^(tree|parser|set|map|cache|headers|searchParams|params|.*Set|.*Map)$/i;

type AstNode = Parameters<Parameters<typeof walkAst>[1]>[0];

function getEnclosingVariableName(node: AstNode): string | undefined {
  let curr = node.parent;
  while (curr) {
    if (curr.type === "variable_declarator") {
      const nameNode = curr.childForFieldName("name");
      if (nameNode?.type === "identifier") return nameNode.text;
      if (nameNode?.type === "array_pattern") {
        const first = nameNode.namedChildren[0];
        if (first?.type === "identifier") return first.text;
      }
      return undefined;
    }
    if (curr.type === "function_declaration" || curr.type === "program") break;
    curr = curr.parent;
  }
  return undefined;
}

function getEnclosingScopeName(node: AstNode): string | undefined {
  let curr = node.parent;
  while (curr) {
    if (curr.type === "function_declaration" || curr.type === "method_definition") {
      const name = curr.childForFieldName("name")?.text;
      if (name) return name;
    }
    if (curr.type === "arrow_function" || curr.type === "function_expression") {
      const varName = getEnclosingVariableName(curr);
      if (varName) return varName;
    }
    curr = curr.parent;
  }
  return undefined;
}

function isNonDbDeleteCall(fnText: string): boolean {
  if (!fnText.endsWith(".delete")) return false;
  const receiver = fnText.slice(0, -".delete".length).split(".").pop() ?? "";
  return NON_DB_DELETE_RECEIVERS.test(receiver);
}

function extractZodFieldsFromText(text: string): string[] {
  const match = /z\.object\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(text);
  if (!match?.[1]) return [];
  const fields: string[] = [];
  const fieldRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = fieldRegex.exec(match[1])) !== null) {
    if (m[1]) fields.push(m[1]);
  }
  return dedupeStrings(fields);
}

function extractFetchMetadata(text: string): { endpoint?: string; fields?: string[] } {
  const urlMatch = /fetch\s*\(\s*["'`]([^"'`]+)["'`]/.exec(text);
  const endpoint = urlMatch?.[1];
  const fields: string[] = [];
  const bodyMatch = /JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(text);
  if (bodyMatch?.[1]) {
    for (const part of bodyMatch[1].split(",")) {
      const key = part.trim().split(":")[0]?.trim();
      if (key && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        fields.push(key);
      }
    }
  }
  return {
    endpoint,
    fields: fields.length > 0 ? dedupeStrings(fields) : undefined,
  };
}

export async function analyzeTypeScript(
  code: string,
  filePath: string,
  language: Extract<SupportedLanguage, "typescript" | "tsx"> = "typescript"
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  return withParsedTree(code, language, (root) => {
    const lines = code.split(/\r?\n/);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const seenIds = new Set<string>();
    const moduleMutableVars = new Set<string>();

    const addNode = (node: FlowNode) => {
      if (seenIds.has(node.id)) return;
      seenIds.add(node.id);
      nodes.push(node);
    };

    // 1. Collect module-level `let` / `var` declarations for implicit mutation detection
    for (const child of root.namedChildren) {
      if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
        const text = child.text.trim();
        if (text.startsWith("let ") || text.startsWith("var ")) {
          walkAst(child, (n) => {
            if (n.type === "variable_declarator") {
              const nameNode = n.childForFieldName("name");
              if (nameNode?.type === "identifier") {
                moduleMutableVars.add(nameNode.text);
              }
            }
          });
        }
      }
    }

    // 2. Walk AST to extract Input, State, Implicit Warnings, and Output
    walkAst(root, (node) => {
      const row = node.startPosition.row;
      const endRow = node.endPosition.row;

      // Input Gate: Next.js Route Handlers (GET, POST, etc.)
      if (node.type === "function_declaration") {
        const name = node.childForFieldName("name")?.text;
        const params = node.childForFieldName("parameters")?.text ?? "";
        if (name && NEXT_HTTP_METHODS.has(name)) {
          addNode({
            id: makeNodeId("in", filePath, row, `route_${name}`),
            label: `${name} Route Handler`,
            category: "INPUT_GATE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            inputFormat: `HTTP ${name} Request`,
            schemaOrType: params || "Request",
            codeSnippet: getSnippet(lines, row, endRow, 6),
          });
        } else if (language === "tsx" && name && /^[A-Z]/.test(name) && params.length > 2) {
          addNode({
            id: makeNodeId("in", filePath, row, `props_${name}`),
            label: `${name} Props`,
            category: "INPUT_GATE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            inputFormat: "React Props",
            schemaOrType: params,
            codeSnippet: getSnippet(lines, row, row + 2, 3),
          });
        }
      }

      // Call expressions: Zod, Hooks, useEffect, NextResponse, fetch, ORM writes
      if (node.type === "call_expression") {
        const fnText = node.childForFieldName("function")?.text ?? "";
        const argsNode = node.childForFieldName("arguments");
        const fullText = node.text;

        if (fnText === "z.object") {
          const fields = extractZodFieldsFromText(fullText);
          const symbolName = getEnclosingVariableName(node);
          const schemaSummary =
            fields.length > 0
              ? `${symbolName ? `${symbolName} ` : ""}{ ${fields.join(", ")} }`
              : fullText.slice(0, 120);
          addNode({
            id: makeNodeId("in", filePath, row, "zod_schema"),
            label: "Zod Schema",
            category: "INPUT_GATE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            inputFormat: "Zod Object Schema",
            schemaOrType: schemaSummary.slice(0, 120),
            codeSnippet: getSnippet(lines, row, endRow, 6),
            metadata:
              fields.length > 0 || symbolName
                ? {
                    ...(fields.length > 0 ? { fields } : {}),
                    ...(symbolName ? { symbolName } : {}),
                  }
                : undefined,
          });
        } else if (STATE_HOOKS.has(fnText)) {
          const stateVar = getEnclosingVariableName(node);
          const scopeName = getEnclosingScopeName(node);
          addNode({
            id: makeNodeId("state", filePath, row, fnText),
            label: stateVar ? `${fnText}: ${stateVar}` : `${fnText} State`,
            category: "STATE_MACHINE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: fullText.replace(/\s+/g, " ").slice(0, 90),
            codeSnippet: getSnippet(lines, row, endRow, 4),
            metadata:
              stateVar || scopeName
                ? {
                    ...(stateVar ? { symbolName: stateVar } : {}),
                    ...(scopeName ? { scopeName } : {}),
                  }
                : undefined,
          });
        } else if (fnText === "useEffect") {
          const argCount = argsNode?.namedChildren.length ?? 0;
          if (argCount < 2) {
            addNode({
              id: makeNodeId("warn", filePath, row, "useEffect_no_deps"),
              label: "useEffect (no deps)",
              category: "IMPLICIT_WARNING",
              language,
              filePath,
              lineRange: [row + 1, endRow + 1],
              schemaOrType: "Missing Dependency Array",
              codeSnippet: getSnippet(lines, row, endRow, 5),
              metadata: {
                warningMessage:
                  "useEffect called without a dependency array; runs on every render and may cause implicit side-effect loops.",
              },
            });
          }
        } else if (
          fnText === "NextResponse.json" ||
          fnText === "Response.json" ||
          fnText === "redirect"
        ) {
          const argSummary = (argsNode?.text ?? "").replace(/\s+/g, " ").slice(0, 100);
          addNode({
            id: makeNodeId("out", filePath, row, fnText.replace(".", "_")),
            label: fnText,
            category: "OUTPUT_GATE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            outputFormat: fnText === "redirect" ? "HTTP Redirect" : "HTTP JSON Response",
            schemaOrType: argSummary || fnText,
            codeSnippet: getSnippet(lines, row, endRow, 5),
          });
        } else if (fnText === "fetch") {
          const methodMatch = /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i.exec(fullText);
          if (methodMatch) {
            const meta = extractFetchMetadata(fullText);
            addNode({
              id: makeNodeId("out", filePath, row, "fetch_mutation"),
              label: `fetch ${meta.endpoint ?? "API"}`,
              category: "OUTPUT_GATE",
              language,
              filePath,
              lineRange: [row + 1, endRow + 1],
              outputFormat: `HTTP ${methodMatch[1].toUpperCase()} JSON`,
              schemaOrType: meta.fields ? `Payload: { ${meta.fields.join(", ")} }` : "HTTP Mutation",
              codeSnippet: getSnippet(lines, row, endRow, 6),
              metadata: meta,
            });
          }
        } else if (/\.(create|update|delete|insert)\b/.test(fnText) && !isNonDbDeleteCall(fnText)) {
          addNode({
            id: makeNodeId("out", filePath, row, "db_write"),
            label: `DB Write (${fnText})`,
            category: "OUTPUT_GATE",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            outputFormat: "Database Mutation",
            schemaOrType: fullText.replace(/\s+/g, " ").slice(0, 100),
            codeSnippet: getSnippet(lines, row, endRow, 5),
          });
        }
      }

      // Implicit Warnings: process.env, window, localStorage, sessionStorage
      if (node.type === "member_expression") {
        const text = node.text;
        if (
          text === "process.env" ||
          text.startsWith("localStorage.") ||
          text.startsWith("sessionStorage.") ||
          text.startsWith("window.")
        ) {
          addNode({
            id: makeNodeId("warn", filePath, row, text.split(".").slice(0, 2).join("_")),
            label: `Implicit ${text}`,
            category: "IMPLICIT_WARNING",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: "Implicit Environment / Browser Global",
            codeSnippet: getSnippet(lines, row, row, 2),
            metadata: {
              warningMessage: `Direct access to '${text}' bypasses explicit Input Gate parameters.`,
            },
          });
        }
      }

      // Implicit Warnings: mutation of module-level `let`/`var` inside nested blocks
      if (
        (node.type === "assignment_expression" ||
          node.type === "augmented_assignment_expression" ||
          node.type === "update_expression") &&
        node.parent?.type !== "program"
      ) {
        const target =
          node.childForFieldName("left")?.text ?? node.childForFieldName("argument")?.text;
        if (target && moduleMutableVars.has(target)) {
          addNode({
            id: makeNodeId("warn", filePath, row, `mut_${target}`),
            label: `Mutates module var '${target}'`,
            category: "IMPLICIT_WARNING",
            language,
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: "Module-Level Mutable State",
            codeSnippet: getSnippet(lines, row, endRow, 3),
            metadata: {
              isMutatedExternally: true,
              warningMessage: `Function mutates module-level variable '${target}', creating hidden shared state.`,
            },
          });
        }
      }

      // Output Gate: JSX Return in TSX
      if (
        language === "tsx" &&
        node.type === "return_statement" &&
        (node.text.includes("<") && node.text.includes(">"))
      ) {
        const scopeName = getEnclosingScopeName(node);
        const firstJsxLine = getSnippet(lines, row, row + 1, 2).replace(/\s+/g, " ").trim();
        addNode({
          id: makeNodeId("out", filePath, row, "jsx_render"),
          label: scopeName ? `JSX: ${scopeName}` : "JSX UI Render",
          category: "OUTPUT_GATE",
          language,
          filePath,
          lineRange: [row + 1, endRow + 1],
          outputFormat: "React JSX Element",
          schemaOrType: firstJsxLine.slice(0, 90),
          codeSnippet: getSnippet(lines, row, endRow, 6),
          metadata: scopeName ? { scopeName } : undefined,
        });
      }
    });

    // 3. Connect intra-file edges: Input -> State/Implicit -> Output
    const inputs = nodes.filter((n) => n.category === "INPUT_GATE");
    const middles = nodes.filter(
      (n) => n.category === "STATE_MACHINE" || n.category === "IMPLICIT_WARNING"
    );
    const outputs = nodes.filter((n) => n.category === "OUTPUT_GATE");

    const addEdge = (source: FlowNode, target: FlowNode, label?: string) => {
      const isImplicitLeak =
        source.category === "IMPLICIT_WARNING" || target.category === "IMPLICIT_WARNING";
      edges.push({
        id: `e_${source.id}__${target.id}`,
        source: source.id,
        target: target.id,
        label,
        isImplicitLeak: isImplicitLeak || undefined,
      });
    };

    if (middles.length > 0) {
      for (const inp of inputs) {
        for (const mid of middles) {
          addEdge(
            inp,
            mid,
            mid.category === "IMPLICIT_WARNING" ? "touches implicit state" : "flows into"
          );
        }
      }
      for (const mid of middles) {
        for (const out of outputs) {
          addEdge(
            mid,
            out,
            mid.category === "IMPLICIT_WARNING" ? "implicit leak" : "produces"
          );
        }
      }
    } else {
      for (const inp of inputs) {
        for (const out of outputs) {
          addEdge(inp, out, "direct transform");
        }
      }
    }

    return { nodes, edges };
  });
}
