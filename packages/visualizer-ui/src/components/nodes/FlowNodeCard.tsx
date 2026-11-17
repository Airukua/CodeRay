import { Handle, Position } from "@xyflow/react";
import type { DiffStatus, FlowNode } from "@flowguard/shared";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cpu,
  FileCode2,
  LogIn,
} from "lucide-react";
import type { ReactNode } from "react";

interface StyleConfig {
  topBar: string;
  iconBox: string;
  handleBorder: string;
  handleGlow: string;
  codeAccent: string;
  icon: ReactNode;
  extraClass?: string;
}

const CATEGORY_STYLES: Record<FlowNode["category"], StyleConfig> = {
  INPUT_GATE: {
    topBar: "border-t-emerald-500",
    iconBox: "bg-emerald-500/10 text-emerald-400",
    handleBorder: "!border-emerald-400/80 group-hover:!border-emerald-300",
    handleGlow: "",
    codeAccent: "text-emerald-300",
    icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
  },
  STATE_MACHINE: {
    topBar: "border-t-sky-500",
    iconBox: "bg-sky-500/10 text-sky-400",
    handleBorder: "!border-sky-400/80 group-hover:!border-sky-300",
    handleGlow: "",
    codeAccent: "text-sky-300",
    icon: <Cpu className="h-3.5 w-3.5" />,
  },
  IMPLICIT_WARNING: {
    topBar: "border-t-red-500",
    iconBox: "bg-red-500/15 text-red-400",
    handleBorder: "!border-red-400/80 group-hover:!border-red-300",
    handleGlow: "",
    codeAccent: "text-red-300",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  OUTPUT_GATE: {
    topBar: "border-t-purple-500",
    iconBox: "bg-purple-500/10 text-purple-400",
    handleBorder: "!border-purple-400/80 group-hover:!border-purple-300",
    handleGlow: "",
    codeAccent: "text-purple-300",
    icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
  },
};

const DIFF_BADGE: Record<Exclude<DiffStatus, "unchanged">, { label: string; cls: string }> = {
  added: { label: "+ ADDED", cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" },
  removed: { label: "- REMOVED", cls: "bg-red-500/20 text-red-300 border border-red-500/40" },
  modified: { label: "~ MODIFIED", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
};

function formatShortLocation(filePath: string): { fileName: string; dirPath: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dirPath = lastSlash > 0 ? normalized.slice(0, lastSlash) : "";
  return { fileName, dirPath };
}

function formatPrimaryTitle(flowNode: FlowNode): string {
  if (flowNode.label === "Zod Schema" && flowNode.metadata?.symbolName) {
    return flowNode.metadata.symbolName;
  }
  // Remove redundant "(Pydantic)" or "(Zod)" suffix when schemaOrType already displays it
  if (flowNode.schemaOrType) {
    return flowNode.label.replace(/\s*\((Pydantic|Zod)\)\s*$/i, "");
  }
  return flowNode.label;
}

function renderSchemaContract(schemaOrType: string, accentClass: string) {
  const colonIdx = schemaOrType.indexOf(":");
  if (colonIdx > 0 && colonIdx < 20 && !schemaOrType.startsWith("{")) {
    const prefix = schemaOrType.slice(0, colonIdx + 1);
    const rest = schemaOrType.slice(colonIdx + 1).trim();
    return (
      <>
        <span className="text-slate-500">{prefix}</span>{" "}
        <span className={accentClass}>{rest}</span>
      </>
    );
  }
  return <span className={accentClass}>{schemaOrType}</span>;
}

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

  const displayTitle = formatPrimaryTitle(flowNode);
  const loc = formatShortLocation(flowNode.filePath);

  return (
    <div
      className={`group relative w-[320px] rounded-xl border border-t-2 border-white/[0.08] ${style.topBar} bg-[#0F172A] shadow-xl transition-colors duration-150 hover:border-x-white/20 hover:border-b-white/20 ${
        selected ? "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-950" : ""
      }`}
    >

      <Handle
        type="target"
        position={Position.Left}
        className={`!h-3 !w-3 !rounded-full !border-2 !bg-[#090D16] !transition-all ${style.handleBorder} ${style.handleGlow}`}
      />

      <div className="space-y-2.5 p-4">
        {/* Header: Step badge, Icon, Title, Language micro-badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {flowNode.stepOrder !== undefined && (
              <span className="mt-0.5 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                #{flowNode.stepOrder}
              </span>
            )}
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.iconBox}`}
            >
              {style.icon}
            </span>
            <span className="line-clamp-2 text-[14px] font-bold leading-snug tracking-tight text-white">
              {displayTitle}
            </span>
          </div>
          <span className="mt-0.5 shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-slate-300 uppercase">
            {flowNode.language}
          </span>
        </div>

        {/* Sub-header: Input Format */}
        {flowNode.inputFormat && (
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-emerald-300/90">
            <LogIn className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className="truncate">{flowNode.inputFormat}</span>
          </div>
        )}

        {/* Body: Description */}
        {flowNode.description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-[#94A3B8]">
            {flowNode.description}
          </p>
        )}

        {/* Structured Footer: Location + Scope/Service tag */}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-slate-300">
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate">
              {loc.fileName}:{flowNode.lineRange[0]}
            </span>
          </div>
          {flowNode.metadata?.scopeName ? (
            <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              {flowNode.metadata.scopeName}
            </span>
          ) : (
            loc.dirPath && (
              <span className="max-w-[130px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {loc.dirPath}
              </span>
            )
          )}
        </div>

        {/* Recessed Code Contract Block */}
        {flowNode.schemaOrType && (
          <div className="truncate rounded-md border border-white/[0.06] bg-[#090D16] px-2.5 py-1.5 font-mono text-[11px]">
            {renderSchemaContract(flowNode.schemaOrType, style.codeAccent)}
          </div>
        )}

        {diff && (
          <div className="flex justify-end">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${diff.cls}`}>
              {diff.label}
            </span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={`!h-3 !w-3 !rounded-full !border-2 !bg-[#090D16] !transition-all ${style.handleBorder} ${style.handleGlow}`}
      />
    </div>
  );
}
