import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

export interface CustomEdgeData extends Record<string, unknown> {
  isLeak?: boolean;
  strokeColor?: string;
  pathOffset?: number;
  labelOffsetY?: number;
}

export function CustomFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = data as CustomEdgeData | undefined;
  const isLeak = Boolean(edgeData?.isLeak);
  const pathOffset = edgeData?.pathOffset ?? 24;
  const labelOffsetY = edgeData?.labelOffsetY ?? 0;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: pathOffset,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffsetY}px)`,
            }}
            className={`nodrag nopan pointer-events-auto absolute z-10 max-w-[200px] whitespace-normal rounded-md border px-2 py-1 text-center text-[11px] font-medium leading-tight shadow-sm ${
              isLeak
                ? "border-red-500/40 bg-[#1A0E14] text-red-300"
                : "border-white/10 bg-[#0B1120] text-slate-200"
            }`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
