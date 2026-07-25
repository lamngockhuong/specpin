// JSX-tree half of the react-router adapter: walks the AST for <Route>
// elements (at any nesting depth) and decides, per element, whether it
// yields a concrete route path or should be skipped (catch-all, index,
// redirect-only, or a pathless layout/group wrapper). Split out of
// react-router.ts to keep both files under the 200-line cap.

import type * as TS from "typescript";

/** react-router's catch-all path literal — shared with the object-array form
 * in react-router.ts. */
export const CATCH_ALL_PATH = "*";

/** Walks the whole tree (any depth) collecting concrete route paths from
 * `<Route>` JSX elements into `paths`, pushing a warning for every
 * intentionally-skipped entry (catch-all/index/redirect-only). A pathless
 * layout/group wrapper (no path, no index, no <Navigate> element) is a
 * silent no-op — its children are visited independently by the same walk. */
export function collectJsxRoutePaths(
  ts: typeof TS,
  root: TS.Node,
  paths: string[],
  warnings: string[],
): void {
  const visit = (node: TS.Node): void => {
    const attrs = routeAttributes(ts, node);
    if (attrs) handleRouteElement(ts, attrs, paths, warnings);
    ts.forEachChild(node, visit);
  };
  visit(root);
}

function routeAttributes(ts: typeof TS, node: TS.Node): TS.JsxAttributes | undefined {
  if (ts.isJsxSelfClosingElement(node) && tagName(ts, node.tagName) === "Route") {
    return node.attributes;
  }
  if (ts.isJsxElement(node) && tagName(ts, node.openingElement.tagName) === "Route") {
    return node.openingElement.attributes;
  }
  return undefined;
}

function tagName(ts: typeof TS, tag: TS.JsxTagNameExpression): string {
  return ts.isIdentifier(tag) ? tag.text : "";
}

function handleRouteElement(
  ts: typeof TS,
  attrs: TS.JsxAttributes,
  paths: string[],
  warnings: string[],
): void {
  const path = findJsxStringAttr(ts, attrs, "path");
  if (path === CATCH_ALL_PATH) {
    warnings.push('route path="*" skipped (catch-all)');
    return;
  }
  if (path !== undefined) {
    paths.push(path);
    return;
  }
  if (hasJsxAttr(ts, attrs, "index")) {
    warnings.push("index route skipped (no concrete path)");
    return;
  }
  if (elementIsNavigate(ts, attrs)) {
    warnings.push("redirect-only route (<Navigate>) skipped");
    return;
  }
  // Otherwise: a pathless layout/group wrapper (e.g. an auth-gate shell around
  // nested <Route> children). Its children are visited independently by the
  // tree walk, so this is a silent no-op, not a malformed entry.
}

function findJsxStringAttr(
  ts: typeof TS,
  attrs: TS.JsxAttributes,
  name: string,
): string | undefined {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop) || !ts.isIdentifier(prop.name) || prop.name.text !== name) {
      continue;
    }
    const init = prop.initializer;
    if (!init) return undefined;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
      return init.expression.text;
    }
    return undefined;
  }
  return undefined;
}

function hasJsxAttr(ts: typeof TS, attrs: TS.JsxAttributes, name: string): boolean {
  return attrs.properties.some(
    (p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === name,
  );
}

function elementIsNavigate(ts: typeof TS, attrs: TS.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop) || !ts.isIdentifier(prop.name) || prop.name.text !== "element") {
      continue;
    }
    const init = prop.initializer;
    if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
    const expr = init.expression;
    if (ts.isJsxSelfClosingElement(expr)) return tagName(ts, expr.tagName) === "Navigate";
    if (ts.isJsxElement(expr)) return tagName(ts, expr.openingElement.tagName) === "Navigate";
  }
  return false;
}
