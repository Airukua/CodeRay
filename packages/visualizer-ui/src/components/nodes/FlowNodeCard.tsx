import { Handle, Position } from "@xyflow/react";
import type { DiffStatus, FlowNode } from "@flowguard/shared";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Cpu } from "lucide-react";
import type { ReactNode } from "react";

interface StyleConfig {
  border: string;
  bg: string;
  badgeBg: string;
  badgeText: string;
  icon: ReactNode;
  extraClass?: string;
}

const CATEGORY_STYLES: Record<FlowNode["category"], StyleConfig> = {
  INPUT_GATE: {
    border: "border-emerald-500/70",
    bg: "bg-emerald-950/70",
    badgeBg: "bg-emerald-500/20",
    badgeText: "text-emerald-300",
    icon: <ArrowDownToLine className="h-4 w-4 text-emerald-400" />,
  },
  STATE_MACHINE: {
    border: "border-sky-500/70",
    bg: "bg-sky-950/70",
    badgeBg: "bg-sky-500/20",
    badgeText: "text-sky-300",
    icon: <Cpu className="h-4 w-4 text-sky-400" />,
  },
  IMPLICIT_WARNING: {
    border: "border-red-500",
    bg: "bg-red-950/80",
    badgeBg: "bg-red-500/25",
    badgeText: "text-red-300",
    icon: <AlertTriangle className="h-4 w-4 text-red-400" />,
    extraClass: "implicit-warning-pulse",
  },
  OUTPUT_GATE: {
    border: "border-purple-500/70",
    bg: "bg-purple-950/70",
    badgeBg: "bg-purple-500/20",
    badgeText: "text-purple-300",
    icon: <ArrowUpFromLine className="h-4 w-4 text-purple-400" />,
  },
};

const DIFF_BADGE: Record<Exclude<DiffStatus, "unchanged">, { label: string; cls: string }> = {
  added: { label: "+ ADDED", cls: "bg-emerald-500 text-slate-950" },
  removed: { label: "- REMOVED", cls: "bg-red-500 text-white" },
  modified: { label: "~ MODIFIED", cls: "bg-amber-400 text-slate-950" },
};

export function FlowNodeCard({
  flowNode,
  selected,
}: {
  flowNode: FlowNode;
  selected?: boolean;
}) {
  const style = CATEGORY_STYLES[flowNode.category];
  const diff =
    flowNode.diffStatus && flowNode.diffStatus !== "unchanged"
      ? DIFF_BADGE[flowNode.diffStatus]
      : null;

  return (
    <div
      className={`w-[270px] rounded-lg border-2 px-3 py-2.5 shadow-lg backdrop-blur transition-all ${style.border} ${style.bg} ${style.extraClass ?? ""} ${
        selected ? "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-slate-900 !bg-slate-300"
      />

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          {style.icon}
          <span className="truncate text-xs font-semibold text-slate-100">
            {flowNode.label}
          </span>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style.badgeBg} ${style.badgeText}`}
        >
          {flowNode.language}
        </span>
      </div>

      <div className="truncate text-[11px] text-slate-400">
        {flowNode.filePath}:{flowNode.lineRange[0]}
      </div>

      {flowNode.schemaOrType && (
        <div className="mt-1.5 truncate rounded bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-slate-300">
          {flowNode.schemaOrType}
        </div>
      )}

      {diff && (
        <div className="mt-1.5 flex justify-end">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${diff.cls}`}>
            {diff.label}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-slate-900 !bg-slate-300"
      />
    </div>
  );
}
