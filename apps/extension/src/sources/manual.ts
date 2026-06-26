import type { SpecsResponse } from "@specpin/api-client";
import type { SpecSource } from "./source.js";

// ManualSource serves specs pasted/uploaded in the Options page (validated there
// via parseLocalBundle) so the extension can render with no sidecar running. It
// is read-only: capture/save stays a sidecar-only feature in this slice.
export class ManualSource implements SpecSource {
  readonly id = "manual";

  constructor(private specs: SpecsResponse | null = null) {}

  /** Replace (or clear, with null) the in-memory specs. */
  setSpecs(specs: SpecsResponse | null): void {
    this.specs = specs;
  }

  async isAvailable(): Promise<boolean> {
    return this.specs !== null;
  }

  async loadSpecs(): Promise<SpecsResponse> {
    if (!this.specs) throw new Error("manual source has no specs loaded");
    return this.specs;
  }

  async saveSpec(): Promise<void> {
    throw new Error("Manual source is read-only; use the sidecar for capture.");
  }
}
