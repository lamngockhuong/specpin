// Full CLI orchestration (load -> extract -> merge -> validate ->
// write/diff/check), exercised end to end against a real temp repo. Covers
// the phase-A3 provenance test-matrix cases that need the whole pipeline
// (2, 6, 7); the pure-merge cases (1, 3, 4, 5) live in merge.test.ts.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

const FSM_SOURCE = `
  export const DEAL_TRANSITIONS = [
    { from: "draft", to: "negotiation", trigger: "Start negotiation" },
    { from: "negotiation", to: "won", trigger: "Mark won" },
  ];
`;

const FSM_SOURCE_CHANGED = `
  export const DEAL_TRANSITIONS = [
    { from: "draft", to: "negotiation", trigger: "Start negotiation" },
    { from: "negotiation", to: "won", trigger: "Mark won" },
    { from: "negotiation", to: "lost", trigger: "Mark lost" },
  ];
`;

const ROUTES_SOURCE = `export default [{ path: "/customers" }, { path: "/settings" }];`;

const CONFIG = {
  flows: [
    { file: "src/fsm.ts", export: "DEAL_TRANSITIONS", adapter: "fsm-table", id: "deal-status" },
  ],
  screens: [{ file: "src/routes.tsx", adapter: "react-router" }],
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("specpin-import-flows CLI — end-to-end orchestration", () => {
  let repoRoot: string;
  let flowsPath: string;
  let screensPath: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "import-flows-cli-e2e-"));
    await mkdir(path.join(repoRoot, ".specs"), { recursive: true });
    await mkdir(path.join(repoRoot, "src"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".specs", "import.config.json"),
      JSON.stringify(CONFIG, null, 2),
    );
    await writeFile(path.join(repoRoot, "src", "fsm.ts"), FSM_SOURCE);
    await writeFile(path.join(repoRoot, "src", "routes.tsx"), ROUTES_SOURCE);
    flowsPath = path.join(repoRoot, ".specs", "flows.json");
    screensPath = path.join(repoRoot, ".specs", "screens.json");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("normal run writes flows.json + screens.json + .import-owned.json", async () => {
    const code = await run([], repoRoot);
    expect(code).toBe(0);
    expect(await fileExists(flowsPath)).toBe(true);
    expect(await fileExists(screensPath)).toBe(true);
    expect(await fileExists(path.join(repoRoot, ".specs", ".import-owned.json"))).toBe(true);

    const flows = JSON.parse(await readFile(flowsPath, "utf8"));
    expect(flows.flows.map((f: { id: string }) => f.id)).toEqual(["deal-status"]);
  });

  it("case 1 (CLI-level): preserves a hand-authored Flow untouched across a real import run", async () => {
    await writeFile(
      flowsPath,
      JSON.stringify(
        {
          version: "1.0",
          flows: [{ id: "manual-flow", object: { en: "Manual" }, states: [], transitions: [] }],
        },
        null,
        2,
      ),
    );
    const code = await run([], repoRoot);
    expect(code).toBe(0);
    const flows = JSON.parse(await readFile(flowsPath, "utf8"));
    expect(flows.flows.map((f: { id: string }) => f.id).sort()).toEqual([
      "deal-status",
      "manual-flow",
    ]);
    const manual = flows.flows.find((f: { id: string }) => f.id === "manual-flow");
    expect(manual.object).toEqual({ en: "Manual" });
  });

  it("case 2: re-run stability — a second run writes nothing, and --check then exits 0", async () => {
    const first = await run([], repoRoot);
    expect(first).toBe(0);
    const flowsAfterFirst = await readFile(flowsPath, "utf8");
    const screensAfterFirst = await readFile(screensPath, "utf8");

    logSpy.mockClear();
    const second = await run([], repoRoot);
    expect(second).toBe(0);
    expect(await readFile(flowsPath, "utf8")).toBe(flowsAfterFirst);
    expect(await readFile(screensPath, "utf8")).toBe(screensAfterFirst);
    const wroteAnything = logSpy.mock.calls.some((call) => String(call[0]).startsWith("wrote "));
    expect(wroteAnything).toBe(false);

    const checkCode = await run(["--check"], repoRoot);
    expect(checkCode).toBe(0);
  });

  it("case 3 (CLI-level): aborts (exit 1) on a Flow id collision with a hand-authored entry, writing nothing", async () => {
    const handAuthored = JSON.stringify(
      {
        version: "1.0",
        flows: [
          { id: "deal-status", object: { en: "Hand-authored" }, states: [], transitions: [] },
        ],
      },
      null,
      2,
    );
    await writeFile(flowsPath, handAuthored);

    const code = await run([], repoRoot);
    expect(code).toBe(1);
    expect(
      errorSpy.mock.calls.some((call) => String(call[0]).includes("refusing to clobber")),
    ).toBe(true);
    expect(await readFile(flowsPath, "utf8")).toBe(handAuthored); // untouched
  });

  it("case 6: aborts (exit 1) when the merged result fails schema validation, writing nothing", async () => {
    const oversizedId = "x".repeat(200); // Flow.id maxLength is 100
    await writeFile(
      path.join(repoRoot, ".specs", "import.config.json"),
      JSON.stringify(
        {
          flows: [
            {
              file: "src/fsm.ts",
              export: "DEAL_TRANSITIONS",
              adapter: "fsm-table",
              id: oversizedId,
            },
          ],
          screens: [],
        },
        null,
        2,
      ),
    );

    const code = await run([], repoRoot);
    expect(code).toBe(1);
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes("would be invalid"))).toBe(
      true,
    );
    expect(await fileExists(flowsPath)).toBe(false);
  });

  it("case 7: --dry-run prints a diff and writes nothing; --check exits 2 after the source changes", async () => {
    const dryRunCode = await run(["--dry-run"], repoRoot);
    expect(dryRunCode).toBe(0);
    expect(await fileExists(flowsPath)).toBe(false);
    expect(await fileExists(screensPath)).toBe(false);
    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("+++ flows.json");

    const normalCode = await run([], repoRoot);
    expect(normalCode).toBe(0);

    await writeFile(path.join(repoRoot, "src", "fsm.ts"), FSM_SOURCE_CHANGED);
    const staleCheckCode = await run(["--check"], repoRoot);
    expect(staleCheckCode).toBe(2);
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes("flows.json"))).toBe(true);
    // --check must not have written anything despite detecting drift.
    const flowsAfterCheck = JSON.parse(await readFile(flowsPath, "utf8"));
    expect(flowsAfterCheck.flows[0].transitions).toHaveLength(2);
  });
});
