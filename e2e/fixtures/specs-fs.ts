import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { formatErrors, type Spec, validateSpecFile } from "@specpin/spec-schema";

/** One `<area>.spec.json` file as it sits on disk. */
export interface SpecFileOnDisk {
  /** Base name, e.g. `login.spec.json`. */
  file: string;
  group: string;
  specs: Spec[];
}

/** Base names of every `*.spec.json` in a corpus, sorted so comparisons are stable. */
export async function listSpecFiles(specsDir: string): Promise<string[]> {
  const entries = await readdir(specsDir);
  return entries.filter((name) => name.endsWith(".spec.json")).sort();
}

/** Read one spec file and validate it against the v1 schema.
 *
 *  Validation is not optional here. A capture that renders but writes a file the
 *  schema rejects is a real defect — and the sidecar is the only other thing that
 *  would have caught it, so a test asserting merely "a file appeared" would pass
 *  straight over it. Uses the shipped ajv validators rather than a hand-rolled shape
 *  check, so the assertion tracks the schema automatically. */
export async function readSpecFile(specsDir: string, file: string): Promise<SpecFileOnDisk> {
  const raw = await readFile(join(specsDir, file), "utf8");
  const parsed = JSON.parse(raw) as { group: string; specs: Spec[] };
  const result = validateSpecFile(parsed);
  if (!result.valid) {
    throw new Error(`${file} does not validate against schema v1:\n${formatErrors(result.errors)}`);
  }
  return { file, group: parsed.group, specs: parsed.specs };
}

/** Every spec in the corpus, tagged with the file it came from. */
export async function readAllSpecs(specsDir: string): Promise<Array<{ file: string; spec: Spec }>> {
  const files = await listSpecFiles(specsDir);
  const contents = await Promise.all(files.map((file) => readSpecFile(specsDir, file)));
  return contents.flatMap((content) => content.specs.map((spec) => ({ file: content.file, spec })));
}

/** How many specs the corpus holds — the figure `GET_STATUS` reports as `specCount`. */
export async function countSpecs(specsDir: string): Promise<number> {
  return (await readAllSpecs(specsDir)).length;
}

/** Raw file contents keyed by base name. Taken before a write so a test can prove
 *  exactly which files a save touched, rather than only that the target changed. */
export type CorpusSnapshot = Map<string, string>;

export async function snapshotCorpus(specsDir: string): Promise<CorpusSnapshot> {
  const files = await listSpecFiles(specsDir);
  const pairs = await Promise.all(
    files.map(async (file) => [file, await readFile(join(specsDir, file), "utf8")] as const),
  );
  return new Map(pairs);
}

/** What a write did to the corpus.
 *
 *  The guard against a save quietly rewriting a neighbouring file is asserting that
 *  `added + changed` holds exactly one entry (see `expectSingleTouchedFile`) — an
 *  untouched-file list is not needed to prove it, so none is produced. */
export interface CorpusDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export async function diffCorpus(specsDir: string, before: CorpusSnapshot): Promise<CorpusDiff> {
  const after = await snapshotCorpus(specsDir);
  const diff: CorpusDiff = { added: [], changed: [], removed: [] };

  for (const [file, content] of after) {
    if (!before.has(file)) diff.added.push(file);
    else if (before.get(file) !== content) diff.changed.push(file);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) diff.removed.push(file);
  }

  return diff;
}
