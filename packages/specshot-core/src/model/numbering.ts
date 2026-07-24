/**
 * Numbering: reading-order sort + reindex (flat and hierarchical) + nextItemNo.
 * Pure functions over MarkDoc — no DOM, no state. Depth is capped at 3 (contract).
 */
import type { MarkDoc, MarkItem, Position } from "./mark-doc.js";

/** Default vertical band (px) within which items count as the same visual row. */
export const DEFAULT_BAND = 24;
const MAX_DEPTH = 3;

function area(p: Position): number {
  return Math.max(0, p.endX - p.startX) * Math.max(0, p.endY - p.startY);
}

/**
 * Reading order: top→bottom by banded startY, then left→right by startX.
 * Banding stops tiny Y differences from scrambling a visual row.
 */
export function readingOrderSort(items: MarkItem[], band = DEFAULT_BAND): MarkItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ba = Math.floor(a.item.position.startY / band);
      const bb = Math.floor(b.item.position.startY / band);
      if (ba !== bb) return ba - bb;
      if (a.item.position.startX !== b.item.position.startX)
        return a.item.position.startX - b.item.position.startX;
      if (a.item.position.startY !== b.item.position.startY)
        return a.item.position.startY - b.item.position.startY;
      return a.i - b.i; // stable
    })
    .map((x) => x.item);
}

/**
 * Compare two itemNos by numeric segments so "6.10" sorts after "6.9" (not
 * lexically before it) and "2" sorts before "1.1"'s parent grouping correctly.
 */
export function compareItemNo(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? -1;
    const vb = pb[i] ?? -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/** The next unused top-level integer itemNo for a doc. */
export function nextItemNo(doc: MarkDoc): string {
  let max = 0;
  for (const item of doc) {
    const top = Number.parseInt(item.itemNo.split(".")[0] ?? "", 10);
    if (Number.isFinite(top) && top > max) max = top;
  }
  return String(max + 1);
}

/** Renumber every item 1..N in reading order, ignoring containment. Preserves label. */
export function reindexFlat(doc: MarkDoc, band = DEFAULT_BAND): MarkDoc {
  return readingOrderSort(doc, band).map((item, i) => ({
    ...item,
    itemNo: String(i + 1),
  }));
}

/**
 * True when `child` is (mostly) inside `parent` — used to infer nesting.
 * Requires >= 80% of the child's area to fall within the parent rect, and the
 * parent to be strictly larger, so equal/near-equal boxes don't nest each other.
 */
export function contains(parent: Position, child: Position, ratio = 0.8): boolean {
  if (area(parent) <= area(child)) return false;
  const ix = Math.max(0, Math.min(parent.endX, child.endX) - Math.max(parent.startX, child.startX));
  const iy = Math.max(0, Math.min(parent.endY, child.endY) - Math.max(parent.startY, child.startY));
  const inter = ix * iy;
  const childArea = area(child);
  if (childArea === 0) return false;
  return inter / childArea >= ratio;
}

interface TreeNode {
  item: MarkItem;
  children: TreeNode[];
}

/**
 * Renumber hierarchically: containers get an integer, nested children get
 * dotted numbers (6, 6.1, 6.2 …) in reading order, capped at depth 3.
 * Items deeper than depth 3 are flattened up to their depth-3 ancestor's level.
 */
export function reindexHierarchical(doc: MarkDoc, band = DEFAULT_BAND): MarkDoc {
  const sorted = readingOrderSort(doc, band);
  // Each item's parent = the smallest other box that contains it.
  const nodes: TreeNode[] = sorted.map((item) => ({ item, children: [] }));
  const roots: TreeNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    let parent: TreeNode | null = null;
    let parentArea = Number.POSITIVE_INFINITY;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const nodeI = nodes[i];
      const nodeJ = nodes[j];
      if (!nodeI || !nodeJ) continue;
      if (contains(nodeJ.item.position, nodeI.item.position)) {
        const a = area(nodeJ.item.position);
        if (a < parentArea) {
          parent = nodeJ;
          parentArea = a;
        }
      }
    }
    const nodeI = nodes[i];
    if (!nodeI) continue;
    if (parent) parent.children.push(nodeI);
    else roots.push(nodeI);
  }

  // Enforce the depth cap BEFORE numbering: any node that would land deeper than
  // MAX_DEPTH is reparented up to its ancestor at (MAX_DEPTH - 1), becoming a
  // depth-MAX_DEPTH sibling. Numbering then stays a clean sibling-index recursion
  // that can never emit a dotted number past the cap or collide.
  const capDepth = (node: TreeNode, chain: TreeNode[]) => {
    // chain = ancestors from root→parent (excludes node). depth = chain.length + 1.
    for (const child of node.children.slice()) capDepth(child, [...chain, node]);
    if (chain.length + 1 > MAX_DEPTH) {
      const parent = chain[chain.length - 1];
      const keeper = chain[MAX_DEPTH - 2]; // ancestor at depth MAX_DEPTH-1
      if (parent && keeper) {
        parent.children = parent.children.filter((c) => c !== node);
        keeper.children.push(node);
      }
    }
  };
  for (const r of roots.slice()) capDepth(r, []);

  const out: MarkItem[] = [];
  const assign = (list: TreeNode[], prefix: string) => {
    const ordered = list.slice().sort((a, b) => sorted.indexOf(a.item) - sorted.indexOf(b.item));
    ordered.forEach((node, idx) => {
      const num = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
      out.push({ ...node.item, itemNo: num });
      if (node.children.length) assign(node.children, num);
    });
  };
  assign(roots, "");
  return out;
}
