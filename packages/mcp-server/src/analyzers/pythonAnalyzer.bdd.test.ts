import { describe, expect, it } from "vitest";
import { analyzePython } from "./pythonAnalyzer.js";

describe("Python & FastAPI AST Analyzer", () => {
  describe("given a clean FastAPI endpoint with Pydantic BaseModel and Enum state", () => {
    const cleanPy = `
from enum import Enum
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

class OrderStatus(Enum):
    PENDING = "pending"
    PAID = "paid"

class OrderRequest(BaseModel):
    user_id: str
    amount: float

@app.post("/api/orders")
def create_order(req: OrderRequest):
    match req.amount:
        case 0:
            return JSONResponse({"ok": False})
    return JSONResponse({"ok": True})
`;

    describe("when analyzePython parses the file", () => {
      it("extracts Pydantic BaseModel & FastAPI route as INPUT_GATE", async () => {
        const res = await analyzePython(cleanPy, "backend/orders.py");
        expect(res.nodes.some((n) => n.category === "INPUT_GATE" && n.label.includes("OrderRequest"))).toBe(true);
        expect(res.nodes.some((n) => n.category === "INPUT_GATE" && n.metadata?.endpoint === "/api/orders")).toBe(true);
      });

      it("extracts Enum and match/case as STATE_MACHINE and JSONResponse as OUTPUT_GATE", async () => {
        const res = await analyzePython(cleanPy, "backend/orders.py");
        expect(res.nodes.some((n) => n.category === "STATE_MACHINE" && n.label.includes("OrderStatus"))).toBe(true);
        expect(res.nodes.some((n) => n.category === "STATE_MACHINE" && n.label.includes("match"))).toBe(true);
        expect(res.nodes.some((n) => n.category === "OUTPUT_GATE" && n.label === "JSONResponse")).toBe(true);
      });
    });
  });

  describe("given Python code with implicit global state and mutable defaults", () => {
    const leakyPy = `
import os
CACHE = {}

def process_item(user_id: str, history=[]):
    global CACHE
    secret = os.environ["API_KEY"]
    CACHE[user_id] = secret
    return CACHE
`;

    describe("when analyzePython scans the file", () => {
      it("flags global, mutable default argument, and os.environ as IMPLICIT_WARNING", async () => {
        const res = await analyzePython(leakyPy, "backend/leaky.py");
        const warnings = res.nodes.filter((n) => n.category === "IMPLICIT_WARNING");
        expect(warnings.some((w) => w.label.includes("global"))).toBe(true);
        expect(warnings.some((w) => w.label.includes("Mutable default"))).toBe(true);
        expect(warnings.some((w) => w.label.includes("os.environ"))).toBe(true);
        expect(res.edges.some((e) => e.isImplicitLeak === true)).toBe(true);
      });
    });
  });

  describe("given an empty or comment-only Python file", () => {
    describe("when analyzePython runs", () => {
      it("returns empty nodes and edges cleanly", async () => {
        const res = await analyzePython("# just a comment\n", "backend/empty.py");
        expect(res.nodes).toEqual([]);
        expect(res.edges).toEqual([]);
      });
    });
  });
});
