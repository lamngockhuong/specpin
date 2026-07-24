// argv parsing for `specpin-import-flows`, isolated from orchestration so
// the shape of the flags is directly unit-testable without spawning a
// process.

export interface CliArgs {
  /** Explicit path to import.config.json; defaults to `<repo>/.specs/import.config.json`. */
  config?: string;
  /** Repo root; defaults to `process.cwd()`. */
  repo: string;
  /** Print the run plan without writing (writer lands in A3). */
  dryRun: boolean;
  /** CI mode: exit non-zero if output would change (lands in A3). */
  check: boolean;
  help: boolean;
}

export type ParseArgsResult = { ok: true; args: CliArgs } | { ok: false; error: string };

const FLAGS_WITH_VALUE = new Set(["--config", "--repo"]);

/** Parse `specpin-import-flows [--config <path>] [--repo <dir>] [--dry-run] [--check] [--help]`.
 * Unknown flags are rejected (clearer than silently ignoring a typo). */
export function parseArgs(argv: string[], cwd: string): ParseArgsResult {
  const args: CliArgs = { repo: cwd, dryRun: false, check: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--check") {
      args.check = true;
      continue;
    }
    if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: `${arg} requires a value` };
      }
      if (arg === "--config") args.config = value;
      if (arg === "--repo") args.repo = value;
      continue;
    }
    return { ok: false, error: `unknown option: ${arg}` };
  }

  return { ok: true, args };
}

export const USAGE = `Usage: specpin-import-flows [options]

Reads a committed .specs/import.config.json and imports flows.json /
screens.json from consumer TypeScript source (FSM tables, route tables).

Options:
  --config <path>   Path to import.config.json (default: <repo>/.specs/import.config.json)
  --repo <dir>       Repo root (default: current working directory)
  --dry-run          Print the planned import without writing (writer lands in a later phase)
  --check            CI mode: exit non-zero if output would change (lands in a later phase)
  -h, --help         Show this help message
`;
