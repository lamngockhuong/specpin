import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScreens } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { extractReactRouter } from "../src/adapters/react-router.js";

// Mirrors apps/extension/src/shared/visibility.ts matchPathGlob: "*" matches
// one segment, "**" matches across segments. Re-implemented here (rather than
// importing the extension package) to keep this test's only dependency
// direction from CLI package -> nothing extension-specific.
function matchPathGlob(glob: string, pathname: string): boolean {
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 1;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c as string)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re).test(pathname);
}

const JSX_SOURCE = `
import { Navigate, Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/deals/new" element={<NewDeal />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
`;

describe("extractReactRouter — JSX <Route> form", () => {
  it("extracts a screen per concrete path, skipping the layout wrapper and catch-all", () => {
    const { screens, warnings } = extractReactRouter({ sourceText: JSX_SOURCE });
    expect(screens.map((s) => s.id)).toEqual([
      "login",
      "dashboard",
      "customers",
      "customers-id",
      "deals-new",
      "settings",
    ]);
    expect(warnings).toEqual(['route path="*" skipped (catch-all)']);
  });

  it("generalizes :param segments to ** consistent with matchPathGlob", () => {
    const { screens } = extractReactRouter({ sourceText: JSX_SOURCE });
    const detail = screens.find((s) => s.id === "customers-id");
    expect(detail?.urlGlob).toBe("/customers/**");
    expect(matchPathGlob(detail?.urlGlob ?? "", "/customers/42")).toBe(true);
    expect(matchPathGlob(detail?.urlGlob ?? "", "/customers")).toBe(false);
  });

  it("keeps static paths unchanged", () => {
    const { screens } = extractReactRouter({ sourceText: JSX_SOURCE });
    expect(screens.find((s) => s.id === "login")?.urlGlob).toBe("/login");
    expect(screens.find((s) => s.id === "deals-new")?.urlGlob).toBe("/deals/new");
  });

  it("produces Screen[] that validateScreens accepts", () => {
    const { screens } = extractReactRouter({ sourceText: JSX_SOURCE });
    const result = validateScreens({ version: "1.0", screens, transitions: [] });
    expect(result.valid).toBe(true);
  });

  it("warns on an index route (no concrete path)", () => {
    const source = `
      export function App() {
        return (
          <Routes>
            <Route index element={<Home />} />
            <Route path="/about" element={<About />} />
          </Routes>
        );
      }
    `;
    const { screens, warnings } = extractReactRouter({ sourceText: source });
    expect(screens.map((s) => s.id)).toEqual(["about"]);
    expect(warnings).toContain("index route skipped (no concrete path)");
  });

  it("warns on a redirect-only route with no path", () => {
    const source = `
      export function App() {
        return (
          <Routes>
            <Route element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
          </Routes>
        );
      }
    `;
    const { screens, warnings } = extractReactRouter({ sourceText: source });
    expect(screens.map((s) => s.id)).toEqual(["home"]);
    expect(warnings).toContain("redirect-only route (<Navigate>) skipped");
  });

  it("is deterministic: re-running on identical input yields byte-identical output", () => {
    const first = extractReactRouter({ sourceText: JSX_SOURCE });
    const second = extractReactRouter({ sourceText: JSX_SOURCE });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("extractReactRouter — route-object-array form", () => {
  it("extracts screens from a named export array, skipping malformed/catch-all entries", () => {
    const source = `
      export const ROUTES = [
        { path: "/login", Component: Login },
        { path: "/customers/:id", Component: CustomerDetail },
        { path: "*", Component: NotFound },
        { Component: Layout },
        "not-an-object",
      ];
    `;
    const { screens, warnings } = extractReactRouter({ sourceText: source, exportName: "ROUTES" });
    expect(screens.map((s) => s.id)).toEqual(["login", "customers-id"]);
    expect(warnings.some((w) => w.includes('path="*" skipped'))).toBe(true);
    expect(warnings.some((w) => w.includes('missing "path"'))).toBe(true);
    expect(warnings.some((w) => w.includes("skipped 1 non-object"))).toBe(true);
  });

  it("supports a default-export array when no exportName is given", () => {
    const source = `
      export default [
        { path: "/one" },
        { path: "/two" },
      ];
    `;
    const { screens } = extractReactRouter({ sourceText: source });
    expect(screens.map((s) => s.id)).toEqual(["one", "two"]);
  });
});

describe("extractReactRouter — malformed/empty input", () => {
  it("warns when no routes are found at all", () => {
    const { screens, warnings } = extractReactRouter({ sourceText: "export const X = 1;" });
    expect(screens).toEqual([]);
    expect(warnings.some((w) => w.includes("no route paths found"))).toBe(true);
  });
});

describe("extractReactRouter — real demo App.tsx (worked example)", () => {
  it("matches the live App.tsx routes and produces globs matchPathGlob accepts", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const appPath = path.resolve(here, "../../../examples/demo-react-app/src/App.tsx");
    const sourceText = await readFile(appPath, "utf8");

    const { screens, warnings } = extractReactRouter({ sourceText });

    expect(screens.map((s) => s.id)).toEqual([
      "login",
      "dashboard",
      "customers",
      "customers-id",
      "deals-new",
      "settings",
    ]);
    expect(warnings).toEqual(['route path="*" skipped (catch-all)']);

    const detail = screens.find((s) => s.id === "customers-id");
    expect(detail?.urlGlob).toBe("/customers/**");
    expect(matchPathGlob(detail?.urlGlob ?? "", "/customers/42")).toBe(true);

    const result = validateScreens({ version: "1.0", screens, transitions: [] });
    expect(result.valid).toBe(true);
  });
});
