import type { NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "../../utils/layoutDagre";
import { FlowNodeCard } from "./FlowNodeCard";

export function StateMachineNode({ data, selected }: NodeProps) {
  const { flowNode } = data as FlowNodeData;
  return <FlowNodeCard flowNode={flowNode} selected={selected} />;
}
