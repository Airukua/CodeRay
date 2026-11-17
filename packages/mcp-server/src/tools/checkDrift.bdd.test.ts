import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serverState } from "../state.js";
import { handleCheckArchitectureDrift } from "./checkDrift.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

describe("check_architecture_drift (TypeScript & Python)", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "coderay-drift-"));
    serverState.projectRoot = repoDir;

    await git(["init"], repoDir);
    await git(["config", "user.email", "test@coderay.dev"], repoDir);
    await git(["config", "user.name", "CodeRay Test"], repoDir);

    await fs.writeFile(
      path.join(repoDir, "route.ts"),
      `import { z } from "zod";
import { NextResponse } from "next/server";

const OrderSchema = z.object({ userId: z.string() });

export async function POST(req: Request) {
  const body = OrderSchema.parse(await req.json());
  return NextResponse.json({ ok: true, userId: body.userId });
}
`
    );

    await fs.writeFile(
      path.join(repoDir, "service.py"),
      `def compute_total(price: float, qty: int) -> float:
    return price * qty
`
    );

    await fs.writeFile(
      path.join(repoDir, "route.test.ts"),
      `import { expect, it } from "vitest";
it("works", () => {
  expect(1 + 1).toBe(2);
  expect(true).toBe(true);
});
`
    );

    await fs.writeFile(
      path.join(repoDir, "test_service.py"),
      `def test_compute():
    assert 2 * 3 == 6
    assert 1 + 1 == 2
`
    );

    await git(["add", "-A"], repoDir);
    await git(["commit", "-m", "baseline"], repoDir);
  });

  afterEach(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  it("flags RED when TypeScript edit removes Zod INPUT_GATE and adds process.env leak", async () => {
    await fs.writeFile(
      path.join(repoDir, "route.ts"),
      `import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  return NextResponse.json({ ok: Boolean(token) });
}
`
    );

    const res = await handleCheckArchitectureDrift({ projectRoot: repoDir });
    const json = JSON.parse(res.content[0].text);

    expect(json.passed).toBe(false);
    expect(json.riskTier).toBe("RED");
    expect(json.newImplicitWarnings.length).toBeGreaterThan(0);
    expect(json.removedInputGates.some((g: { label: string }) => g.label === "Zod Schema")).toBe(true);
  });

  it("flags RED and TYPE_BYPASS when Python edit adds os.environ leak and # type: ignore", async () => {
    await fs.writeFile(
      path.join(repoDir, "service.py"),
      `import os

def compute_total(price: float, qty: int) -> float:  # type: ignore
    discount = float(os.environ.get("DISCOUNT", "0"))
    return price * qty - discount
`
    );

    const res = await handleCheckArchitectureDrift({ projectRoot: repoDir });
    const json = JSON.parse(res.content[0].text);

    expect(json.passed).toBe(false);
    expect(json.riskTier).toBe("RED");
    expect(json.newImplicitWarnings.some((w: { label: string }) => w.label.includes("os.environ"))).toBe(true);
    expect(json.slopWarnings.some((s: { ruleId: string }) => s.ruleId === "TYPE_BYPASS")).toBe(true);
  });

  it("flags RED on test-tampering (.skip and removed assertions) in TS and Python tests", async () => {
    await fs.writeFile(
      path.join(repoDir, "route.test.ts"),
      `import { expect, it } from "vitest";
it.skip("works", () => {
  expect(1 + 1).toBe(2);
});
`
    );

    await fs.writeFile(
      path.join(repoDir, "test_service.py"),
      `import unittest

@unittest.skip("broken")
def test_compute():
    assert 2 * 3 == 6
`
    );

    const res = await handleCheckArchitectureDrift({ projectRoot: repoDir });
    const json = JSON.parse(res.content[0].text);

    expect(json.passed).toBe(false);
    expect(json.riskTier).toBe("RED");
    expect(json.testTampering.some((t: { ruleId: string }) => t.ruleId === "TEST_SKIP_ADDED")).toBe(true);
    expect(json.testTampering.some((t: { ruleId: string }) => t.ruleId === "ASSERTIONS_REMOVED")).toBe(true);
  });

  it("returns GREEN and passed=true on a clean refactor with no leaks or tampering", async () => {
    await fs.writeFile(
      path.join(repoDir, "service.py"),
      `def compute_total(price: float, qty: int) -> float:
    return round(price * qty, 2)
`
    );

    const res = await handleCheckArchitectureDrift({ projectRoot: repoDir });
    const json = JSON.parse(res.content[0].text);

    expect(json.passed).toBe(true);
    expect(json.riskTier).toBe("GREEN");
    expect(json.newImplicitWarnings).toEqual([]);
    expect(json.testTampering).toEqual([]);
  });

  it("rejects malicious baseRef values to prevent command injection (OWASP A03)", async () => {
    const res = await handleCheckArchitectureDrift({
      projectRoot: repoDir,
      baseRef: "HEAD; rm -rf /",
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toContain("Invalid git baseRef");
  });
});
