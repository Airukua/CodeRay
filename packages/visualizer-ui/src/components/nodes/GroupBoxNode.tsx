import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface GroupBoxData extends Record<string, unknown> {
  title: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function GroupBoxNode({ data }: NodeProps) {
  const groupData = data as GroupBoxData;
  const collapsed = Boolean(groupData.collapsed);

  return (
    <div
      className={`pointer-events-none h-full w-full rounded-2xl border border-white/[0.1] bg-white/[0.02] transition-colors ${
        collapsed ? "flex items-center justify-between px-4 py-3" : "p-4"
      }`}
    >
      {collapsed && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-slate-400 !bg-[#090D16]"
        />
      )}

      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={groupData.onToggle}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0F172A] px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-slate-200 uppercase transition-colors hover:border-white/25 hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-sky-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-sky-400" />
          )}
          <span>{groupData.title}</span>
        </button>

        <span className="rounded bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {groupData.count} {groupData.count === 1 ? "node" : "nodes"}
          {collapsed ? " (collapsed)" : ""}
        </span>
      </div>

      {collapsed && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !rounded-full !border-2 !border-slate-400 !bg-[#090D16]"
        />
      )}
    </div>
  );
}
