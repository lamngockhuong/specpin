import type { SidecarClient, SpecsResponse } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import type { SpecSource } from "./source.js";

// SidecarSource: the primary (and, in the MVP, only available) source. Wraps the
// typed SidecarClient so the rest of the extension talks the SpecSource contract.
export class SidecarSource implements SpecSource {
  readonly id = "sidecar";

  constructor(private readonly client: SidecarClient) {}

  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.client.health();
      return health.ok === true;
    } catch {
      return false;
    }
  }

  loadSpecs(): Promise<SpecsResponse> {
    return this.client.getSpecs();
  }

  saveSpec(file: string, spec: Spec): Promise<void> {
    return this.client.saveSpec(file, spec);
  }

  watch(onChange: () => void): () => void {
    return this.client.subscribe(onChange);
  }
}
