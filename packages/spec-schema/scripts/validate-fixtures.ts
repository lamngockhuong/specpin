import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateGuides,
  validateManifest,
  validateSpec,
  validateSpecFile,
  validateViews,
} from "../src/validate.js";

// Cross-validator (ajv side): every fixture under tests/fixtures/specs/valid
// must validate; every fixture under .../invalid must fail. The Go side runs the
// identical corpus (apps/cli/internal/schema/fixtures_test.go); CI runs both, so
// any disagreement between ajv and the Go validator fails the build.
const here = dirname(fileURLToPath(import.meta.url));
const specsDir = resolve(here, "../../../tests/fixtures/specs");
const viewsDir = resolve(here, "../../../tests/fixtures/views");
const guidesDir = resolve(here, "../../../tests/fixtures/guides");
const manifestDir = resolve(here, "../../../tests/fixtures/manifest");

async function readFixtures(
  baseDir: string,
  kind: "valid" | "invalid",
): Promise<Array<{ name: string; data: unknown }>> {
  const dir = join(baseDir, kind);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (name) => ({
      name,
      data: JSON.parse(await readFile(join(dir, name), "utf8")),
    })),
  );
}

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const { name, data } of await readFixtures(specsDir, "valid")) {
    const { valid, errors } = validateSpec(data);
    if (!valid)
      failures.push(`specs/valid/${name} should pass but failed: ${JSON.stringify(errors)}`);
  }
  for (const { name, data } of await readFixtures(specsDir, "invalid")) {
    const { valid } = validateSpec(data);
    if (valid) failures.push(`specs/invalid/${name} should fail but passed`);
  }

  // views.json corpus, cross-checked against validateViews on both sides.
  for (const { name, data } of await readFixtures(viewsDir, "valid")) {
    const { valid, errors } = validateViews(data);
    if (!valid)
      failures.push(`views/valid/${name} should pass but failed: ${JSON.stringify(errors)}`);
  }
  for (const { name, data } of await readFixtures(viewsDir, "invalid")) {
    const { valid } = validateViews(data);
    if (valid) failures.push(`views/invalid/${name} should fail but passed`);
  }

  // guides.json corpus, cross-checked against validateGuides on both sides.
  for (const { name, data } of await readFixtures(guidesDir, "valid")) {
    const { valid, errors } = validateGuides(data);
    if (!valid)
      failures.push(`guides/valid/${name} should pass but failed: ${JSON.stringify(errors)}`);
  }
  for (const { name, data } of await readFixtures(guidesDir, "invalid")) {
    const { valid } = validateGuides(data);
    if (valid) failures.push(`guides/invalid/${name} should fail but passed`);
  }

  // manifest.json corpus, cross-checked against validateManifest on both sides.
  // The manifest is otherwise absent from the shared corpus, so settings drift
  // (e.g. stalenessThresholdDays bounds) would ship silently without this loop.
  for (const { name, data } of await readFixtures(manifestDir, "valid")) {
    const { valid, errors } = validateManifest(data);
    if (!valid)
      failures.push(`manifest/valid/${name} should pass but failed: ${JSON.stringify(errors)}`);
  }
  for (const { name, data } of await readFixtures(manifestDir, "invalid")) {
    const { valid } = validateManifest(data);
    if (valid) failures.push(`manifest/invalid/${name} should fail but passed`);
  }

  // Guard against demo rot: the seeded demo specs must stay schema-valid.
  const demoSpecsDir = resolve(here, "../../../examples/demo-react-app/.specs");
  const manifestRaw = JSON.parse(await readFile(join(demoSpecsDir, "manifest.json"), "utf8"));
  if (!validateManifest(manifestRaw).valid) failures.push("demo manifest.json is invalid");
  for (const file of (await readdir(demoSpecsDir)).filter((f) => f.endsWith(".spec.json"))) {
    const data = JSON.parse(await readFile(join(demoSpecsDir, file), "utf8"));
    const { valid, errors } = validateSpecFile(data);
    if (!valid) failures.push(`demo ${file} is invalid: ${JSON.stringify(errors)}`);
  }

  if (failures.length) {
    console.error("Fixture cross-validation (ajv) FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("Fixture cross-validation (ajv): all fixtures agree with the schema.");
}

void main();
