#!/usr/bin/env node
// CLI for `specpin-import-flows`: parse args, load + validate
// import.config.json, dispatch every entry through the adapter registry,
// merge the result into .specs/flows.json / .specs/screens.json
// (provenance-preserving — see merge.ts), validate the merged output, and
// either write it (normal run), print a diff (--dry-run), or check for
// staleness (--check, a CI gate). Exit codes: 0 ok/in-sync; 1 config,
// read, or validation error; 2 `--check` found a stale file.

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type FlowsConfig,
  formatErrors,
  type ScreensConfig,
  validateFlows,
  validateScreens,
} from "@specpin/spec-schema";
import { parseArgs, USAGE } from "./cli-args.js";
import {
  isFlowsConfigShape,
  isScreensConfigShape,
  listShotScreenIds,
  loadExistingConfig,
} from "./cli-existing-config.js";
import { loadFileTexts, printExtractionSummary, printRunPlan } from "./cli-report.js";
import { runCheck, runDryRun, runWrite } from "./cli-run-modes.js";
import { loadImportConfig } from "./config.js";
import { mapConfig } from "./map-config.js";
import { mergeFlows, mergeScreens } from "./merge.js";
import { readOwnedIds } from "./owned.js";
import { canonicalize } from "./write-canonical.js";

const DEFAULT_FLOWS_CONFIG: FlowsConfig = { version: "1.0", flows: [] };
const DEFAULT_SCREENS_CONFIG: ScreensConfig = { version: "1.0", screens: [], transitions: [] };

/** Runs the CLI for the given argv (excluding the node/script prefix) and
 * cwd, returning the process exit code. Kept side-effect-testable: no
 * `process.exit()` in here. */
export async function run(argv: string[], cwd: string): Promise<number> {
  const parsed = parseArgs(argv, cwd);
  if (!parsed.ok) {
    console.error(`specpin-import-flows: ${parsed.error}\n`);
    console.error(USAGE);
    return 1;
  }

  const { args } = parsed;
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const result = await loadImportConfig(args.repo, args.config);
  if (!result.ok) {
    for (const error of result.errors) console.error(`specpin-import-flows: ${error}`);
    return 1;
  }

  printRunPlan(result.config);

  const filesResult = await loadFileTexts(result.config);
  if (!filesResult.ok) {
    for (const error of filesResult.errors) console.error(`specpin-import-flows: ${error}`);
    return 1;
  }

  const mapped = mapConfig(result.config, filesResult.texts);
  printExtractionSummary(mapped);

  // Mirrors loadImportConfig's own default so flows.json/screens.json live
  // alongside import.config.json, wherever --config points it.
  const resolvedConfigPath = args.config ?? path.join(args.repo, ".specs", "import.config.json");
  const specsDir = path.dirname(resolvedConfigPath);
  const flowsPath = path.join(specsDir, "flows.json");
  const screensPath = path.join(specsDir, "screens.json");

  const existingFlows = await loadExistingConfig(
    flowsPath,
    DEFAULT_FLOWS_CONFIG,
    isFlowsConfigShape,
  );
  if (!existingFlows.ok) {
    console.error(`specpin-import-flows: ${existingFlows.error}`);
    return 1;
  }
  const existingScreens = await loadExistingConfig(
    screensPath,
    DEFAULT_SCREENS_CONFIG,
    isScreensConfigShape,
  );
  if (!existingScreens.ok) {
    console.error(`specpin-import-flows: ${existingScreens.error}`);
    return 1;
  }

  const owned = await readOwnedIds(specsDir);
  const shotScreenIds = await listShotScreenIds(specsDir);

  const flowsMerge = mergeFlows(existingFlows.value, mapped.flowsConfig, owned.flows);
  if (!flowsMerge.ok) {
    console.error(`specpin-import-flows: ${flowsMerge.error}`);
    return 1;
  }
  const screensMerge = mergeScreens(
    existingScreens.value,
    mapped.screensConfig,
    owned.screens,
    shotScreenIds,
  );
  if (!screensMerge.ok) {
    console.error(`specpin-import-flows: ${screensMerge.error}`);
    return 1;
  }
  for (const note of screensMerge.notes) console.log(`note: ${note}`);

  const flowsValidation = validateFlows(flowsMerge.config);
  if (!flowsValidation.valid) {
    console.error(
      `specpin-import-flows: merged flows.json would be invalid, aborting without writing: ${formatErrors(flowsValidation.errors)}`,
    );
    return 1;
  }
  const screensValidation = validateScreens(screensMerge.config);
  if (!screensValidation.valid) {
    console.error(
      `specpin-import-flows: merged screens.json would be invalid, aborting without writing: ${formatErrors(screensValidation.errors)}`,
    );
    return 1;
  }

  const flowsCanonical = canonicalize(flowsMerge.config);
  const screensCanonical = canonicalize(screensMerge.config);
  const modeInput = {
    specsDir,
    flowsPath,
    screensPath,
    flowsConfig: flowsMerge.config,
    screensConfig: screensMerge.config,
    existingFlowsRaw: existingFlows.raw,
    existingScreensRaw: existingScreens.raw,
    flowsCanonical,
    screensCanonical,
    flowsChanged: flowsCanonical !== existingFlows.raw,
    screensChanged: screensCanonical !== existingScreens.raw,
    flowIds: mapped.flowsConfig.flows.map((f) => f.id),
    screenIds: mapped.screensConfig.screens.map((s) => s.id),
  };

  if (args.dryRun) return runDryRun(modeInput);
  if (args.check) return runCheck(modeInput);
  return runWrite(modeInput);
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  run(process.argv.slice(2), process.cwd()).then((code) => {
    process.exitCode = code;
  });
}
