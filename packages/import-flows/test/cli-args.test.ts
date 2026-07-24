import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli-args.js";

const CWD = "/repo";

describe("parseArgs", () => {
  it("defaults to cwd, no flags", () => {
    const result = parseArgs([], CWD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.args).toEqual({ repo: CWD, dryRun: false, check: false, help: false });
    }
  });

  it("parses --config, --repo, --dry-run, --check", () => {
    const result = parseArgs(
      ["--config", "/repo/.specs/custom.json", "--repo", "/other", "--dry-run", "--check"],
      CWD,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.args).toEqual({
        config: "/repo/.specs/custom.json",
        repo: "/other",
        dryRun: true,
        check: true,
        help: false,
      });
    }
  });

  it("parses -h and --help", () => {
    expect(parseArgs(["-h"], CWD)).toEqual({
      ok: true,
      args: { repo: CWD, dryRun: false, check: false, help: true },
    });
    expect(parseArgs(["--help"], CWD)).toEqual({
      ok: true,
      args: { repo: CWD, dryRun: false, check: false, help: true },
    });
  });

  it("rejects an unknown option", () => {
    const result = parseArgs(["--bogus"], CWD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("--bogus");
    }
  });

  it("rejects --config with no value", () => {
    const result = parseArgs(["--config"], CWD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("--config requires a value");
    }
  });
});
