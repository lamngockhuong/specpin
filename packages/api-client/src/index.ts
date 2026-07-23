// @specpin/api-client: typed client over the sidecar HTTP contract. The
// extension uses this instead of hand-rolling fetch calls; types are imported
// from @specpin/spec-schema (no duplication).

export {
  type ConnectionState,
  type FlowsConfig,
  type GuidesConfig,
  type HealthResponse,
  type ScreensConfig,
  SidecarClient,
  type SidecarClientOptions,
  type SpecsResponse,
  type SpecWithFile,
  type ViewsConfig,
} from "./client.js";

export { SidecarError } from "./errors.js";
export { type SubscribeOptions, subscribeEvents } from "./events.js";
