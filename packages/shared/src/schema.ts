import { z } from "zod";

export const NodeCategorySchema = z.enum([
  "INPUT_GATE",
  "STATE_MACHINE",
  "IMPLICIT_WARNING",
  "OUTPUT_GATE",
]);
export type NodeCategory = z.infer<typeof NodeCategorySchema>;

export const SupportedLanguageSchema = z.enum([
  "typescript",
  "tsx",
  "python",
]);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const DiffStatusSchema = z.enum([
  "added",
  "removed",
  "modified",
  "unchanged",
]);
export type DiffStatus = z.infer<typeof DiffStatusSchema>;

export const FlowNodeMetadataSchema = z.object({
  isMutatedExternally: z.boolean().optional(),
  warningMessage: z.string().optional(),
  endpoint: z.string().optional(),
  fields: z.array(z.string()).optional(),
});
export type FlowNodeMetadata = z.infer<typeof FlowNodeMetadataSchema>;

export const FlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: NodeCategorySchema,
  language: SupportedLanguageSchema,
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  schemaOrType: z.string().optional(),
  codeSnippet: z.string(),
  diffStatus: DiffStatusSchema.optional(),
  metadata: FlowNodeMetadataSchema.optional(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  isImplicitLeak: z.boolean().optional(),
  diffStatus: DiffStatusSchema.optional(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const GraphDiffSchema = z.object({
  addedNodeIds: z.array(z.string()),
  removedNodeIds: z.array(z.string()),
  modifiedNodeIds: z.array(z.string()),
  addedEdgeIds: z.array(z.string()),
  removedEdgeIds: z.array(z.string()),
});
export type GraphDiff = z.infer<typeof GraphDiffSchema>;

export const FlowGraphPayloadSchema = z.object({
  timestamp: z.string(),
  projectRoot: z.string(),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  diff: GraphDiffSchema.optional(),
});
export type FlowGraphPayload = z.infer<typeof FlowGraphPayloadSchema>;

export const UiSelectionSchema = z.object({
  selectedNodeId: z.string().optional(),
  selectedEdgeId: z.string().optional(),
  filePath: z.string().optional(),
  userNote: z.string().optional(),
  timestamp: z.string(),
});
export type UiSelection = z.infer<typeof UiSelectionSchema>;

export const ServerToUiMessageSchema = z.object({
  type: z.literal("GRAPH_UPDATE"),
  payload: FlowGraphPayloadSchema,
});
export type ServerToUiMessage = z.infer<typeof ServerToUiMessageSchema>;

export const UiToServerMessageSchema = z.object({
  type: z.literal("UI_SELECTION"),
  payload: UiSelectionSchema,
});
export type UiToServerMessage = z.infer<typeof UiToServerMessageSchema>;

export const ArchitectureViolationSchema = z.object({
  severity: z.enum(["error", "warning"]),
  ruleId: z.string(),
  nodeId: z.string().optional(),
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  message: z.string(),
  suggestion: z.string(),
});
export type ArchitectureViolation = z.infer<typeof ArchitectureViolationSchema>;
