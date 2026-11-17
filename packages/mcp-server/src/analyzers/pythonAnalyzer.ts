import type Parser from "web-tree-sitter";
import type { FlowEdge, FlowNode } from "@flowguard/shared";
import { withParsedTree } from "./astEngine.js";
import { dedupeStrings, getSnippet, makeNodeId, walkAst } from "./astHelpers.js";

function getEnclosingPythonScope(node: Parser.SyntaxNode): string | undefined {
  let fnName: string | undefined;
  let className: string | undefined;
  let curr = node.parent;
  while (curr) {
    if (!fnName && curr.type === "function_definition") {
      fnName = curr.childForFieldName("name")?.text;
    } else if (!className && curr.type === "class_definition") {
      className = curr.childForFieldName("name")?.text;
    }
    curr = curr.parent;
  }
  if (className && fnName) return `${className}.${fnName}`;
  return fnName ?? className;
}

function extractPydanticFields(classNode: Parser.SyntaxNode): string[] {
  const fields: string[] = [];
  const body = classNode.childForFieldName("body");
  if (!body) return fields;

  for (const stmt of body.namedChildren) {
    const expr = stmt.type === "expression_statement" ? stmt.namedChildren[0] : stmt;
    if (expr?.type === "assignment") {
      const left = expr.childForFieldName("left");
      if (left?.type === "identifier") {
        fields.push(left.text);
      }
    } else if (stmt.text.includes(":")) {
      const name = stmt.text.split(":")[0]?.trim();
      if (name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        fields.push(name);
      }
    }
  }
  return dedupeStrings(fields);
}

export async function analyzePython(
  code: string,
  filePath: string
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  return withParsedTree(code, "python", (root) => {
    const lines = code.split(/\r?\n/);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const seenIds = new Set<string>();

    const addNode = (node: FlowNode) => {
      if (seenIds.has(node.id)) return;
      seenIds.add(node.id);
      nodes.push(node);
    };

    walkAst(root, (node) => {
      const row = node.startPosition.row;
      const endRow = node.endPosition.row;

      // Input Gate: Pydantic BaseModel or Enum State Machine
      if (node.type === "class_definition") {
        const name = node.childForFieldName("name")?.text ?? "Model";
        const superclasses = node.childForFieldName("superclasses")?.text ?? "";
        if (superclasses.includes("BaseModel")) {
          const fields = extractPydanticFields(node);
          addNode({
            id: makeNodeId("in", filePath, row, `pydantic_${name}`),
            label: `${name} (Pydantic)`,
            category: "INPUT_GATE",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: `Pydantic: ${name}(${fields.join(", ")})`,
            codeSnippet: getSnippet(lines, row, endRow, 8),
            metadata: fields.length > 0 ? { fields } : undefined,
          });
        } else if (superclasses.includes("Enum")) {
          addNode({
            id: makeNodeId("state", filePath, row, `enum_${name}`),
            label: `${name} (Enum State)`,
            category: "STATE_MACHINE",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: `Enum: ${name}`,
            codeSnippet: getSnippet(lines, row, endRow, 6),
          });
        }
      }

      // FastAPI Route Decorators & Mutable Default Arguments
      if (node.type === "decorated_definition") {
        const text = node.text;
        const routeMatch = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/.exec(
          text
        );
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase();
          const endpoint = routeMatch[2];
          addNode({
            id: makeNodeId("in", filePath, row, `route_${method}_${endpoint}`),
            label: `${method} ${endpoint}`,
            category: "INPUT_GATE",
            language: "python",
            filePath,
            lineRange: [row + 1, row + 3],
            schemaOrType: `FastAPI ${method} ${endpoint}`,
            codeSnippet: getSnippet(lines, row, row + 3, 4),
            metadata: { endpoint },
          });
        }
      }

      if (node.type === "function_definition") {
        const fnName = node.childForFieldName("name")?.text ?? "fn";
        const params = node.childForFieldName("parameters");
        if (params) {
          walkAst(params, (p) => {
            if (p.type === "default_parameter" || p.type === "typed_default_parameter") {
              const val = p.childForFieldName("value");
              if (val && (val.type === "list" || val.type === "dictionary" || val.type === "set")) {
                addNode({
                  id: makeNodeId("warn", filePath, p.startPosition.row, `mutable_default_${fnName}`),
                  label: `Mutable default in ${fnName}()`,
                  category: "IMPLICIT_WARNING",
                  language: "python",
                  filePath,
                  lineRange: [p.startPosition.row + 1, p.endPosition.row + 1],
                  schemaOrType: `Mutable Default: ${p.text}`,
                  codeSnippet: getSnippet(lines, row, row + 1, 2),
                  metadata: {
                    isMutatedExternally: true,
                    warningMessage: `Mutable default argument '${p.text}' persists across function calls.`,
                  },
                });
              }
            }
          });
        }
      }

      // Implicit Warning: `global` keyword
      if (node.type === "global_statement") {
        const scope = getEnclosingPythonScope(node);
        addNode({
          id: makeNodeId("warn", filePath, row, "global_stmt"),
          label: node.text.trim(),
          category: "IMPLICIT_WARNING",
          language: "python",
          filePath,
          lineRange: [row + 1, endRow + 1],
          schemaOrType: "Global Mutable State",
          codeSnippet: getSnippet(lines, row, endRow, 3),
          metadata: {
            isMutatedExternally: true,
            warningMessage: `Use of '${node.text.trim()}' mutates module-level global state.`,
            ...(scope ? { scopeName: scope } : {}),
          },
        });
      }

      // Implicit Warning: os.environ / os.getenv
      if (node.type === "attribute" || node.type === "call") {
        const t = node.text;
        if (t === "os.environ" || t.startsWith("os.getenv(")) {
          const scope = getEnclosingPythonScope(node);
          addNode({
            id: makeNodeId("warn", filePath, row, "os_env"),
            label: `Implicit ${t.split("(")[0]}`,
            category: "IMPLICIT_WARNING",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: "Implicit Env Access",
            codeSnippet: getSnippet(lines, row, row, 2),
            metadata: {
              warningMessage: `Direct access to '${t.split("(")[0]}' bypasses explicit function/config Input Gate.`,
              ...(scope ? { scopeName: scope } : {}),
            },
          });
        }
      }

      // State Machine: match/case or self.<attr> mutation
      if (node.type === "match_statement") {
        const scope = getEnclosingPythonScope(node);
        addNode({
          id: makeNodeId("state", filePath, row, "match_case"),
          label: scope ? `match / case (${scope})` : "match / case State",
          category: "STATE_MACHINE",
          language: "python",
          filePath,
          lineRange: [row + 1, endRow + 1],
          codeSnippet: getSnippet(lines, row, endRow, 6),
          metadata: scope ? { scopeName: scope } : undefined,
        });
      } else if (node.type === "assignment" || node.type === "augmented_assignment") {
        const left = node.childForFieldName("left")?.text ?? "";
        if (left.startsWith("self.")) {
          const scope = getEnclosingPythonScope(node);
          addNode({
            id: makeNodeId("state", filePath, row, left),
            label: `Mutates ${left}`,
            category: "STATE_MACHINE",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            schemaOrType: node.text.replace(/\s+/g, " ").slice(0, 90),
            codeSnippet: getSnippet(lines, row, endRow, 2),
            metadata: scope ? { scopeName: scope, symbolName: left } : { symbolName: left },
          });
        }
      }

      // Output Gate: JSONResponse, return, DB session commit/add
      if (node.type === "call") {
        const fnText = node.childForFieldName("function")?.text ?? "";
        if (fnText === "JSONResponse") {
          const scope = getEnclosingPythonScope(node);
          addNode({
            id: makeNodeId("out", filePath, row, "json_response"),
            label: "JSONResponse",
            category: "OUTPUT_GATE",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            codeSnippet: getSnippet(lines, row, endRow, 4),
            metadata: scope ? { scopeName: scope } : undefined,
          });
        } else if (fnText.endsWith(".add") || fnText.endsWith(".commit")) {
          const scope = getEnclosingPythonScope(node);
          addNode({
            id: makeNodeId("out", filePath, row, "db_write"),
            label: `ORM Write (${fnText})`,
            category: "OUTPUT_GATE",
            language: "python",
            filePath,
            lineRange: [row + 1, endRow + 1],
            codeSnippet: getSnippet(lines, row, endRow, 3),
            metadata: scope ? { scopeName: scope } : undefined,
          });
        }
      } else if (node.type === "return_statement" && !node.text.includes("JSONResponse")) {
        const scope = getEnclosingPythonScope(node);
        addNode({
          id: makeNodeId("out", filePath, row, "return"),
          label: scope ? `return (${scope})` : "return",
          category: "OUTPUT_GATE",
          language: "python",
          filePath,
          lineRange: [row + 1, endRow + 1],
          schemaOrType: node.text.replace(/\s+/g, " ").slice(0, 90),
          codeSnippet: getSnippet(lines, row, endRow, 3),
          metadata: scope ? { scopeName: scope } : undefined,
        });
      }
    });

    // Connect intra-file edges
    const inputs = nodes.filter((n) => n.category === "INPUT_GATE");
    const middles = nodes.filter(
      (n) => n.category === "STATE_MACHINE" || n.category === "IMPLICIT_WARNING"
    );
    const outputs = nodes.filter((n) => n.category === "OUTPUT_GATE");

    const addEdge = (source: FlowNode, target: FlowNode, label?: string) => {
      const srcScope = source.metadata?.scopeName;
      const tgtScope = target.metadata?.scopeName;
      if (srcScope && tgtScope && srcScope !== tgtScope) return;
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
            mid.category === "IMPLICIT_WARNING" ? "touches implicit state" : "transitions"
          );
        }
      }
      for (const mid of middles) {
        for (const out of outputs) {
          addEdge(
            mid,
            out,
            mid.category === "IMPLICIT_WARNING" ? "implicit leak" : "returns"
          );
        }
      }
    } else {
      for (const inp of inputs) {
        for (const out of outputs) {
          addEdge(inp, out, "direct return");
        }
      }
    }

    return { nodes, edges };
  });
}
