import { useState } from "react";
import type { FlowEdge, FlowNode } from "@flowguard/shared";
import { AlertTriangle, ExternalLink, Send, X } from "lucide-react";

interface NodeInspectorProps {
  projectRoot: string;
  selectedNode: FlowNode | null;
  selectedEdge: FlowEdge | null;
  onClose: () => void;
  onSendNote: (note: string) => void;
}

export function NodeInspector({
  projectRoot,
  selectedNode,
  selectedEdge,
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

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-slate-800 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-2xl">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {selectedNode ? selectedNode.category : "FLOW EDGE"}
          </span>
          <h2 className="text-base font-bold text-white">
            {selectedNode ? selectedNode.label : selectedEdge?.label || selectedEdge?.id}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {selectedNode && (
          <>
            {selectedNode.metadata?.warningMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-950/60 p-3 text-xs text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{selectedNode.metadata.warningMessage}</span>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-400">Source Location</div>
              <div className="flex items-center justify-between gap-2 rounded bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-300">
                <span className="truncate">
                  {selectedNode.filePath}:{selectedNode.lineRange[0]}-{selectedNode.lineRange[1]}
                </span>
                <a
                  href={vscodeUri}
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {selectedNode.schemaOrType && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-400">Schema / Type Contract</div>
                <pre className="overflow-x-auto rounded bg-slate-950 p-2.5 font-mono text-xs text-emerald-300">
                  {selectedNode.schemaOrType}
                </pre>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-400">Code Snippet</div>
              <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
                {selectedNode.codeSnippet}
              </pre>
            </div>
          </>
        )}

        {selectedEdge && (
          <div className="space-y-2 rounded bg-slate-950 p-3 text-xs">
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
              <span className={selectedEdge.isImplicitLeak ? "font-bold text-red-400" : "text-slate-300"}>
                {selectedEdge.isImplicitLeak ? "YES" : "No"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-800 pt-3">
        <label className="mb-1.5 block text-xs font-medium text-slate-300">
          Note for Coding Agent (via <code className="text-sky-400">get_ui_selection</code>)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Refactor this implicit env access..."
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            onClick={handleSendNote}
            className="inline-flex items-center gap-1 rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <Send className="h-3.5 w-3.5" />
            {sentFeedback ? "Sent!" : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
