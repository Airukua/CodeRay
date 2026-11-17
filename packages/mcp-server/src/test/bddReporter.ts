import path from "node:path";
import type { Reporter, TestCase, TestModule, TestSuite } from "vitest/node";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  black: "\x1b[30m",
  white: "\x1b[37m",
};

function formatDuration(ms?: number): string {
  if (ms === undefined || ms < 1) return "<1 ms";
  return `${Math.round(ms)} ms`;
}

function getTagFromPath(relPath: string): string {
  if (relPath.includes("chaos")) return "chaos";
  if (relPath.includes("tsReactAnalyzer")) return "ast-ts";
  if (relPath.includes("pythonAnalyzer")) return "ast-py";
  if (relPath.includes("graphAndContracts")) return "contracts";
  if (relPath.includes("mcpTools")) return "mcp-tools";
  return "unit";
}

function printSuiteTree(suite: TestSuite, indentLevel: number): void {
  const indent = "  ".repeat(indentLevel);
  if (indentLevel > 0) {
    console.log(`${indent}${suite.name}`);
  }

  for (const child of suite.children) {
    if (child.type === "suite") {
      printSuiteTree(child, indentLevel + 1);
    } else if (child.type === "test") {
      printTestCase(child, indentLevel + 1);
    }
  }
}

function printTestCase(test: TestCase, indentLevel: number): void {
  const indent = "  ".repeat(indentLevel);
  const result = test.result();
  const diag = test.diagnostic();
  const duration = formatDuration(diag?.duration);

  if (result.state === "passed") {
    console.log(
      `${indent}${ANSI.green}✓${ANSI.reset} ${ANSI.dim}${test.name} (${duration})${ANSI.reset}`
    );
  } else if (result.state === "failed") {
    console.log(
      `${indent}${ANSI.red}✕${ANSI.reset} ${ANSI.red}${test.name}${ANSI.reset} ${ANSI.dim}(${duration})${ANSI.reset}`
    );
    for (const err of result.errors ?? []) {
      console.log(`${indent}  ${ANSI.red}${err.message}${ANSI.reset}`);
    }
  } else {
    console.log(
      `${indent}${ANSI.dim}○ ${test.name} (${result.state})${ANSI.reset}`
    );
  }
}

export class BddReporter implements Reporter {
  private totalPassed = 0;
  private totalFailed = 0;
  private totalModules = 0;
  private startTime = Date.now();

  onInit(): void {
    this.startTime = Date.now();
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.totalModules += 1;
    const relPath = path.relative(process.cwd(), testModule.moduleId);
    const tag = getTagFromPath(relPath);

    for (const child of testModule.children) {
      if (child.type !== "suite") continue;

      const state = child.state();
      const isPass = state === "passed";
      const badge = isPass
        ? `${ANSI.bgGreen}${ANSI.black}${ANSI.bold} PASS ${ANSI.reset}`
        : `${ANSI.bgRed}${ANSI.white}${ANSI.bold} FAIL ${ANSI.reset}`;

      console.log(
        `\n${badge} ${ANSI.cyan}${ANSI.bold}${tag.padEnd(10)}${ANSI.reset} ${ANSI.dim}${relPath}${ANSI.reset}`
      );
      console.log(`${ANSI.bold}${child.name}${ANSI.reset}`);
      printSuiteTree(child, 0);
    }

    for (const test of testModule.children.allTests()) {
      if (test.result().state === "passed") this.totalPassed += 1;
      else if (test.result().state === "failed") this.totalFailed += 1;
    }
  }

  onTestRunEnd(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const summaryColor = this.totalFailed === 0 ? ANSI.green : ANSI.red;
    console.log(
      `\n${ANSI.bold}Test Suites:${ANSI.reset} ${this.totalModules} total`
    );
    console.log(
      `${ANSI.bold}Tests:${ANSI.reset}       ${summaryColor}${this.totalPassed} passed${ANSI.reset}${
        this.totalFailed > 0 ? `, ${ANSI.red}${this.totalFailed} failed${ANSI.reset}` : ""
      }`
    );
    console.log(`${ANSI.bold}Time:${ANSI.reset}        ${elapsed}s\n`);
  }
}
