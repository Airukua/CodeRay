import { describe, expect, it } from "vitest";
import { analyzeTypeScript } from "./tsReactAnalyzer.js";

describe("TypeScript & React/Next.js AST Analyzer", () => {
  describe("given a clean Next.js App Router POST handler with Zod and DB write", () => {
    const cleanRoute = `
      import { NextResponse } from "next/server";
      import { z } from "zod";

      const OrderSchema = z.object({
        userId: z.string(),
        amount: z.number(),
      });

      export async function POST(req: Request) {
        const body = OrderSchema.parse(await req.json());
        await prisma.order.create({ data: body });
        return NextResponse.json({ ok: true });
      }
    `;

    describe("when analyzeTypeScript parses the route", () => {
      it("extracts Input Gates (POST handler & Zod schema) and Output Gates (DB write & NextResponse)", async () => {
        const res = await analyzeTypeScript(cleanRoute, "src/app/api/orders/route.ts", "typescript");
        expect(res.nodes.some((n) => n.category === "INPUT_GATE" && n.label.includes("POST"))).toBe(true);
        expect(res.nodes.some((n) => n.category === "INPUT_GATE" && n.label === "Zod Schema")).toBe(true);
        expect(res.nodes.some((n) => n.category === "OUTPUT_GATE" && n.label.includes("DB Write"))).toBe(true);
        expect(res.nodes.some((n) => n.category === "OUTPUT_GATE" && n.label === "NextResponse.json")).toBe(true);
      });

      it("produces zero IMPLICIT_WARNING nodes and zero implicit leak edges", async () => {
        const res = await analyzeTypeScript(cleanRoute, "src/app/api/orders/route.ts", "typescript");
        expect(res.nodes.filter((n) => n.category === "IMPLICIT_WARNING")).toHaveLength(0);
        expect(res.edges.some((e) => e.isImplicitLeak)).toBe(false);
      });
    });
  });

  describe("given a vibe-coded React TSX component with implicit state leaks", () => {
    const leakyComponent = `
      import { useState, useEffect } from "react";
      let moduleCounter = 0;

      export function Checkout({ total }: { total: number }) {
        const [status, setStatus] = useState("IDLE");
        useEffect(() => {
          moduleCounter += 1;
          localStorage.setItem("last_total", String(total));
        });
        const apiKey = process.env.SECRET_KEY;
        const submit = () => fetch("/api/process", {
          method: "POST",
          body: JSON.stringify({ total, apiKey }),
        });
        return <button onClick={submit}>{status}</button>;
      }
    `;

    describe("when analyzeTypeScript scans the component", () => {
      it("flags useEffect without deps, module-level mutation, localStorage, and process.env as IMPLICIT_WARNING", async () => {
        const res = await analyzeTypeScript(leakyComponent, "src/Checkout.tsx", "tsx");
        const warnings = res.nodes.filter((n) => n.category === "IMPLICIT_WARNING");
        expect(warnings.length).toBeGreaterThanOrEqual(4);
        expect(warnings.some((w) => w.label.includes("useEffect"))).toBe(true);
        expect(warnings.some((w) => w.label.includes("moduleCounter"))).toBe(true);
        expect(warnings.some((w) => w.label.includes("localStorage"))).toBe(true);
        expect(warnings.some((w) => w.label.includes("process.env"))).toBe(true);
      });

      it("marks edges connected to implicit warnings with isImplicitLeak = true", async () => {
        const res = await analyzeTypeScript(leakyComponent, "src/Checkout.tsx", "tsx");
        expect(res.edges.some((e) => e.isImplicitLeak === true)).toBe(true);
      });
    });
  });

  describe("given edge-case inputs (empty file or mid-edit syntax error)", () => {
    describe("when analyzing an empty file", () => {
      it("returns empty nodes and edges without throwing", async () => {
        const res = await analyzeTypeScript("", "src/empty.ts", "typescript");
        expect(res.nodes).toEqual([]);
        expect(res.edges).toEqual([]);
      });
    });

    describe("when analyzing TypeScript code with an incomplete syntax error", () => {
      it("recovers gracefully via Tree-sitter and still detects valid constructs", async () => {
        const broken = `
          export function broken() {
            const x = process.env.TOKEN;
            const unclosed = (
          }
        `;
        const res = await analyzeTypeScript(broken, "src/broken.ts", "typescript");
        expect(res.nodes.some((n) => n.category === "IMPLICIT_WARNING" && n.label.includes("process.env"))).toBe(true);
      });
    });
  });
});
