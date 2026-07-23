import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { ManualBatch } from "../src/shared/config.js";
import { type NamedFile, parseLocalFiles } from "../src/sources/local-bundle.js";

// Repro of the user's exact flow: pick the demo .specs/ folder (manifest + spec
// files + flows.json + screens.json) -> parseLocalFiles -> build the ManualBatch
// the SAME way the background ADD_LOCAL_BATCH handler does -> setLocalBatches ->
// flowsScreensByProject. Proves the parse->store->surface chain end to end.
describe("repro: manual import of demo .specs -> graph feed", () => {
  it("surfaces the demo flows/screens through flowsScreensByProject", () => {
    const specsDir = join(__dirname, "..", "..", "..", "examples", "demo-react-app", ".specs");
    const files: NamedFile[] = readdirSync(specsDir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => ({ name: n, text: readFileSync(join(specsDir, n), "utf8") }));

    const { specs, flows, screens, errors } = parseLocalFiles(files);
    expect(errors).toEqual([]);
    if (!specs) throw new Error("parseLocalFiles returned no specs");
    // The two configs must survive the parse.
    expect(flows?.flows.length).toBeGreaterThan(0);
    expect(screens?.screens.length).toBeGreaterThan(0);

    // Build the batch exactly as background.ts handleAddLocalBatch does.
    const batch: ManualBatch = {
      id: "b1",
      label: specs.manifest.project ?? "demo",
      source: "files",
      importedAt: 0,
      specs,
      ...(flows ? { flows } : {}),
      ...(screens ? { screens } : {}),
    };

    const r = new SidecarRegistry({});
    r.setLocalBatches([batch]);
    const out = r.flowsScreensByProject();
    expect(out).toHaveLength(1);
    expect(out[0]?.flows.flows.length).toBeGreaterThan(0);
    expect(out[0]?.screens.screens.length).toBeGreaterThan(0);
  });
});
