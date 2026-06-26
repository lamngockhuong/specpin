import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, validateSpec, validateSpecFile } from "../src/validate.js";

// Cross-validator (ajv side): every fixture under tests/fixtures/specs/valid
// must validate; every fixture under .../invalid must fail. The Go side runs the
// identical corpus (apps/cli/internal/schema/fixtures_test.go); CI runs both, so
// any disagreement between ajv and the Go validator fails the build.
const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../tests/fixtures/specs");

async function readFixtures(
  kind: "valid" | "invalid",
): Promise<Array<{ name: string; data: unknown }>> {
  const dir = join(fixturesDir, kind);
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

  for (const { name, data } of await readFixtures("valid")) {
    const { valid, errors } = validateSpec(data);
    if (!valid) failures.push(`valid/${name} should pass but failed: ${JSON.stringify(errors)}`);
  }
  for (const { name, data } of await readFixtures("invalid")) {
    const { valid } = validateSpec(data);
    if (valid) failures.push(`invalid/${name} should fail but passed`);
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
