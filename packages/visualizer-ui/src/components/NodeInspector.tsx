import { useState, type ReactNode } from "react";
import type { FlowEdge, FlowNode } from "@flowguard/shared";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  FileCode2,
  Send,
  X,
} from "lucide-react";

interface NodeInspectorProps {
  projectRoot: string;
  selectedNode: FlowNode | null;
  selectedEdge: FlowEdge | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  onSelectNode: (node: FlowNode) => void;
  onClose: () => void;
  onSendNote: (note: string) => void;
}

const CATEGORY_BADGE: Record<
  FlowNode["category"],
  { label: string; cls: string; icon: ReactNode }
> = {
  INPUT_GATE: {
    label: "INPUT_GATE",
    cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    icon: <ArrowDownToLine className="h-3 w-3" />,
  },
  STATE_MACHINE: {
    label: "STATE_MACHINE",
    cls: "border-sky-500/20 bg-sky-500/10 text-sky-400",
    icon: <Cpu className="h-3 w-3" />,
  },
  IMPLICIT_WARNING: {
    label: "IMPLICIT_WARNING",
    cls: "border-red-500/20 bg-red-500/10 text-red-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  OUTPUT_GATE: {
    label: "OUTPUT_GATE",
    cls: "border-teal-500/20 bg-teal-500/10 text-teal-400",
    icon: <ArrowUpFromLine className="h-3 w-3" />,
  },
};

function splitTitleAndBadge(label: string): { title: string; badge?: string; isHttpOk: boolean } {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(label);
  if (!match?.[1] || !match[2]) return { title: label, isHttpOk: false };
  const badge = match[2].trim();
  const isHttpOk = /^2\d\d$/.test(badge);
  return {
    title: match[1].trim(),
    badge: isHttpOk ? `${badge} OK` : badge,
    isHttpOk,
  };
}

function highlightCode(code: string): ReactNode[] {
  const tokenRegex =
    /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:return|const|let|var|export|import|from|async|await|function|def|class|global|if|else|True|False|null|undefined)\b|\b(?:boolean|string|number|float|str|int|void|Promise)\b|\b\d+(?:\.\d+)?\b)/gm;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }
    const token = match[0];
    let cls = "text-slate-200";
    if (token.startsWith("//") || token.startsWith("#")) {
      cls = "text-slate-500 italic";
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      cls = "text-emerald-300";
    } else if (
      /^(return|const|let|var|export|import|from|async|await|function|def|class|global|if|else)$/.test(
        token
      )
    ) {
      cls = "text-purple-300";
    } else if (/^(boolean|string|number|float|str|int|void|Promise|True|False|null|undefined)$/.test(token)) {
      cls = "text-cyan-300";
    } else if (/^\d/.test(token)) {
      cls = "text-amber-300";
    }
    nodes.push(
      <span key={key++} className={cls}>
        {token}
      </span>
    );
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }
  return nodes;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={copied ? "Copied" : label}
      className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-slate-400 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function NodeInspector({
  projectRoot,
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  onSelectNode,
  onClose,
  onSendNote,
}: NodeInspectorProps) {
  const [note, setNote] = useState("");
  const [sentFeedback, setSentFeedback] = useState(false);

  if (!selectedNode && !selectedEdge) return null;

  const handleSendNote = () => {
    onSendNote(note);
    setSentFeedback(true);
    setTimeout(() => setSentFeedback(false), 1800);
  };

  const fullPath = selectedNode
    ? selectedNode.filePath.startsWith("/")
      ? selectedNode.filePath
      : `${projectRoot.replace(/\/$/, "")}/${selectedNode.filePath}`
    : "";
  const vscodeUri = selectedNode
    ? `vscode://file/${fullPath}:${selectedNode.lineRange[0]}`
    : "#";

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incomingEdges = selectedNode ? edges.filter((e) => e.target === selectedNode.id) : [];
  const outgoingEdges = selectedNode ? edges.filter((e) => e.source === selectedNode.id) : [];

  const titleParts = selectedNode
    ? splitTitleAndBadge(selectedNode.label)
    : { title: selectedEdge?.label || selectedEdge?.id || "Flow Edge", isHttpOk: false };
  const categoryBadge = selectedNode ? CATEGORY_BADGE[selectedNode.category] : null;
  const locationText = selectedNode
    ? `${selectedNode.filePath}:${selectedNode.lineRange[0]}-${selectedNode.lineRange[1]}`
    : "";

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 flex max-h-[78vh] w-full shrink-0 flex-col rounded-t-xl border-t border-white/[0.08] bg-[#0B1120] text-sm text-slate-200 shadow-2xl md:static md:z-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3.5">
        <div className="flex items-center justify-between">
          {categoryBadge ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${categoryBadge.cls}`}
            >
              {categoryBadge.icon}
              {categoryBadge.label}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-300">
              FLOW_EDGE
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-[#F8FAFC]">
            {titleParts.title}
          </h2>
          {titleParts.badge && (
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                titleParts.isHttpOk
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-slate-800/80 text-slate-300"
              }`}
            >
              {titleParts.badge}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="dark-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {selectedNode && (
          <>
            {selectedNode.description && (
              <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-[#94A3B8]">
                {selectedNode.description}
              </p>
            )}

            {selectedNode.inputFormat && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs">
                <span className="text-slate-400">Input Format</span>
                <span className="font-mono font-medium text-emerald-300">
                  {selectedNode.inputFormat}
                </span>
              </div>
            )}

            {selectedNode.metadata?.warningMessage && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{selectedNode.metadata.warningMessage}</span>
              </div>
            )}

            {/* Source Location */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium tracking-wide text-slate-400">
                Source Location
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#070B14] px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-slate-300">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="break-all">{locationText}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CopyButton text={locationText} label="Copy source location" />
                  <a
                    href={vscodeUri}
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                  >
                    Open <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>

            {/* Schema / Type Contract */}
            {selectedNode.schemaOrType && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium tracking-wide text-slate-400">
                  Schema / Type Contract
                </div>
                <div className="relative rounded-lg border border-white/[0.06] bg-[#070B14] p-3 pr-10">
                  <div className="absolute right-2 top-2">
                    <CopyButton text={selectedNode.schemaOrType} label="Copy schema" />
                  </div>
                  <pre className="dark-scrollbar overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                    {highlightCode(selectedNode.schemaOrType)}
                  </pre>
                </div>
              </div>
            )}

            {/* Code Snippet */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium tracking-wide text-slate-400">
                Code Snippet
              </div>
              <div className="relative rounded-lg border border-white/[0.06] bg-[#070B14] p-3 pr-10">
                <div className="absolute right-2 top-2">
                  <CopyButton text={selectedNode.codeSnippet} label="Copy code snippet" />
                </div>
                <pre className="dark-scrollbar overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                  {highlightCode(selectedNode.codeSnippet)}
                </pre>
              </div>
            </div>

            {/* Interactive Data Flow Connections */}
            {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium tracking-wide text-slate-400">
                  Data Flow Connections ({incomingEdges.length + outgoingEdges.length})
                </div>
                <div className="space-y-1.5">
                  {incomingEdges.map((edge) => {
                    const src = nodeById.get(edge.source);
                    if (!src) return null;
                    const isImplicit =
                      Boolean(edge.isImplicitLeak) || src.category === "IMPLICIT_WARNING";
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => onSelectNode(src)}
                        className="group flex w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-[#070B14] px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isImplicit
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-sky-500/15 text-sky-400"
                          }`}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-100 group-hover:text-white">
                            {src.label}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {edge.label ?? "flows"}
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          {src.filePath.split("/").pop()}:{src.lineRange[0]}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                      </button>
                    );
                  })}
                  {outgoingEdges.map((edge) => {
                    const tgt = nodeById.get(edge.target);
                    if (!tgt) return null;
                    const isImplicit =
                      Boolean(edge.isImplicitLeak) || tgt.category === "IMPLICIT_WARNING";
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => onSelectNode(tgt)}
                        className="group flex w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-[#070B14] px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isImplicit
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-sky-500/15 text-sky-400"
                          }`}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-100 group-hover:text-white">
                            {tgt.label}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {edge.label ?? "flows"}
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          {tgt.filePath.split("/").pop()}:{tgt.lineRange[0]}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {selectedEdge && (
          <div className="space-y-2 rounded-lg border border-white/[0.06] bg-[#070B14] p-3 text-xs">
            <div>
              <span className="text-slate-400">Source:</span>{" "}
              <code className="text-emerald-300">{selectedEdge.source}</code>
            </div>
            <div>
              <span className="text-slate-400">Target:</span>{" "}
              <code className="text-purple-300">{selectedEdge.target}</code>
            </div>
            <div>
              <span className="text-slate-400">Implicit Leak:</span>{" "}
              <span
                className={
                  selectedEdge.isImplicitLeak ? "font-semibold text-red-400" : "text-slate-300"
                }
              >
                {selectedEdge.isImplicitLeak ? "YES" : "No"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="border-t border-white/[0.08] bg-[#0B1120]/90 px-4 py-3 backdrop-blur-md">
        <label className="mb-2 block text-xs font-medium text-slate-300">
          Note for Coding Agent{" "}
          <span className="text-slate-500">
            (via{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
              get_ui_selection
            </code>
            )
          </span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Refactor this implicit env access..."
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#070B14] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 transition-colors focus:border-blue-500/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSendNote}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#3B82F6] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Send className="h-3.5 w-3.5" />
            {sentFeedback ? "Sent!" : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
