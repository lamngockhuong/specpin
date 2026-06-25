// @specpin/api-client: typed client over the sidecar HTTP contract. The
// extension uses this instead of hand-rolling fetch calls; types are imported
// from @specpin/spec-schema (no duplication).

export {
  SidecarClient,
  type SidecarClientOptions,
  type HealthResponse,
  type SpecsResponse,
  type SpecWithFile,
  type ConnectionState,
} from "./client.js";

export { SidecarError } from "./errors.js";
export { subscribeEvents, type SubscribeOptions } from "./events.js";
