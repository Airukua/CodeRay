import type { ArchitectureViolation, FlowGraphPayload } from "@flowguard/shared";

/**
 * Detects cross-boundary contract mismatches between frontend mutation outputs
 * (e.g. `fetch('/api/process', { body: JSON.stringify({ ... }) })`) and backend
 * input schemas (e.g. Pydantic `BaseModel` or Zod `z.object` in the same backend file).
 */
export function detectContractMismatches(
  graph: FlowGraphPayload
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];

  const fetchOutputs = graph.nodes.filter(
    (n) =>
      n.category === "OUTPUT_GATE" &&
      n.metadata?.endpoint &&
      n.metadata?.fields &&
      n.metadata.fields.length > 0
  );

  const backendRouteInputs = graph.nodes.filter(
    (n) => n.category === "INPUT_GATE" && n.metadata?.endpoint
  );

  for (const fe of fetchOutputs) {
    const feEndpoint = fe.metadata!.endpoint!.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
    const feFields = new Set(fe.metadata!.fields!);

    for (const route of backendRouteInputs) {
      const beEndpoint = route.metadata!.endpoint!.replace(/\/+$/, "");
      if (feEndpoint !== beEndpoint && !feEndpoint.endsWith(beEndpoint)) continue;

      // Find schema nodes (Pydantic/Zod) in the same backend file
      const schemaNodes = graph.nodes.filter(
        (n) =>
          n.filePath === route.filePath &&
          n.category === "INPUT_GATE" &&
          n.metadata?.fields &&
          n.metadata.fields.length > 0
      );

      for (const schema of schemaNodes) {
        const beFields = new Set(schema.metadata!.fields!);
        const missingInFe = [...beFields].filter((f) => !feFields.has(f));
        const extraInFe = [...feFields].filter((f) => !beFields.has(f));

        if (missingInFe.length > 0 || extraInFe.length > 0) {
          violations.push({
            severity: "error",
            ruleId: "CROSS_BOUNDARY_CONTRACT_MISMATCH",
            nodeId: fe.id,
            filePath: fe.filePath,
            lineRange: fe.lineRange,
            message: `Contract mismatch between '${fe.label}' and backend schema '${schema.label}' (${beEndpoint}): missing=[${missingInFe.join(", ")}], unexpected=[${extraInFe.join(", ")}].`,
            suggestion: `Align the JSON payload fields in ${fe.filePath} with ${schema.label} in ${schema.filePath}.`,
          });
        }
      }
    }
  }

  return violations;
}
