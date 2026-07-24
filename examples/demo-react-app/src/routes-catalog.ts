import type { ComponentType } from "react";
import { Reports } from "./screens/Reports.js";

// Routes declared here (a flat array, not JSX) are the ones
// `@specpin/import-flows`'s `react-router` adapter reads for
// `.specs/screens.json` -- see `.specs/import.config.json` and
// docs/run-guide.md "Importing flows/screens from code". App.tsx renders
// them via `.map()` alongside its static <Route> tags, so this array drives
// both the live app and the import: one source of truth for these routes,
// no duplicated declaration. Kept as a separate file (rather than folded
// into App.tsx's own JSX routes) so importing it does not also pick up
// App.tsx's pre-existing, hand-spec'd routes (login/dashboard/customers/
// deals-new/settings already have curated `.specs/screens.json` entries;
// see the "coexistence" note in docs/run-guide.md).
export interface ImportedRoute {
  path: string;
  Component: ComponentType;
}

export const IMPORTED_ROUTES: ImportedRoute[] = [{ path: "/reports", Component: Reports }];
