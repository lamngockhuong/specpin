import { describe, expect, it } from "vitest";
import {
  classifyHref,
  renderInlineMarkdown,
  renderMarkdownBlock,
  safeHref,
  stripMarkdown,
} from "../src/shared/markdown.js";

describe("renderInlineMarkdown", () => {
  it("renders bold and italic", () => {
    expect(renderInlineMarkdown("a **b** c")).toBe("a <strong>b</strong> c");
    expect(renderInlineMarkdown("_i_")).toBe("<em>i</em>");
    expect(renderInlineMarkdown("*i*")).toBe("<em>i</em>");
  });

  it("renders a safe http link with rel + target", () => {
    expect(renderInlineMarkdown("[docs](https://x.com)")).toBe(
      '<a href="https://x.com" rel="noopener noreferrer" target="_blank">docs</a>',
    );
  });

  it("allows mailto links", () => {
    expect(renderInlineMarkdown("[mail](mailto:a@b.com)")).toBe(
      '<a href="mailto:a@b.com" rel="noopener noreferrer" target="_blank">mail</a>',
    );
  });

  it("drops a javascript: link to its literal text, never an href", () => {
    const out = renderInlineMarkdown("[x](javascript:alert(1))");
    expect(out).toContain("x");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("href");
    expect(out).not.toContain("javascript");
  });

  it("renders nested marks inside a link's text", () => {
    expect(renderInlineMarkdown("[**bold**](https://x.com)")).toBe(
      '<a href="https://x.com" rel="noopener noreferrer" target="_blank"><strong>bold</strong></a>',
    );
  });

  it("escapes XSS vectors inert", () => {
    expect(renderInlineMarkdown("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(renderInlineMarkdown("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
    expect(renderInlineMarkdown("**<b>**")).toBe("<strong>&lt;b&gt;</strong>");
  });

  it("never emits class/style/on* attributes", () => {
    const out = renderInlineMarkdown("**a** _b_ [c](https://x)");
    expect(out).not.toMatch(/class=|style=|on\w+=|id=/);
  });

  it("keeps snake_case identifiers intact (boundary rule for _)", () => {
    expect(renderInlineMarkdown("my_var_name")).toBe("my_var_name");
    expect(renderInlineMarkdown("a _word_ b")).toBe("a <em>word</em> b");
  });

  it("leaves unbalanced markers literal with no error", () => {
    expect(renderInlineMarkdown("a ** b")).toBe("a ** b");
    expect(renderInlineMarkdown("[oops](")).toBe("[oops](");
    expect(renderInlineMarkdown("a * b")).toBe("a * b");
  });

  it("round-trips plain text as escaped text (legacy compatibility)", () => {
    expect(renderInlineMarkdown("plain text 1 < 2 & 3")).toBe("plain text 1 &lt; 2 &amp; 3");
  });

  it("does not hang on long pathological input", () => {
    const long = "*".repeat(20000);
    expect(() => renderInlineMarkdown(long)).not.toThrow();
  });
});

describe("renderMarkdownBlock", () => {
  it("builds a bullet list from - lines", () => {
    expect(renderMarkdownBlock("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("builds a numbered list from N. lines", () => {
    expect(renderMarkdownBlock("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("separates paragraphs across blank lines and joins single newlines with <br>", () => {
    expect(renderMarkdownBlock("a\nb\n\nc")).toBe("<p>a<br>b</p><p>c</p>");
  });

  it("applies inline marks inside blocks", () => {
    expect(renderMarkdownBlock("- **bold** item")).toBe(
      "<ul><li><strong>bold</strong> item</li></ul>",
    );
  });

  it("escapes XSS inside a description block", () => {
    expect(renderMarkdownBlock("<img src=x onerror=alert(1)>")).toBe(
      "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
    );
  });

  it("round-trips plain text to a single escaped paragraph", () => {
    expect(renderMarkdownBlock("just words")).toBe("<p>just words</p>");
  });
});

describe("stripMarkdown", () => {
  it("removes markers and URLs, keeps visible text", () => {
    expect(stripMarkdown("**bold** [docs](https://x) - item")).toBe("bold docs item");
  });

  it("drops leading list markers and emphasis", () => {
    expect(stripMarkdown("1. _first_\n2. second")).toBe("first second");
  });

  it("leaves plain text unchanged", () => {
    expect(stripMarkdown("plain words")).toBe("plain words");
  });
});

describe("safeHref", () => {
  it("accepts http/https/mailto", () => {
    expect(safeHref("https://x.com")).toBe("https://x.com");
    expect(safeHref("http://x.com")).toBe("http://x.com");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeHref("HTTPS://x.com")).toBe("HTTPS://x.com");
  });

  it("rejects dangerous and relative schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("/relative/path")).toBeNull();
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("relative.html")).toBeNull();
  });
});

describe("classifyHref", () => {
  const origin = "https://app.example.com";

  it("flags a same-origin absolute URL internal, keeping it verbatim", () => {
    expect(classifyHref("https://app.example.com/admin#x", origin)).toEqual({
      href: "https://app.example.com/admin#x",
      internal: true,
    });
  });

  it("resolves a relative URL against the page origin as internal", () => {
    expect(classifyHref("/admin/users", origin)).toEqual({
      href: "https://app.example.com/admin/users",
      internal: true,
    });
  });

  it("flags a cross-origin URL external", () => {
    expect(classifyHref("https://other.example.com/x", origin)).toEqual({
      href: "https://other.example.com/x",
      internal: false,
    });
    // A different subdomain is a different origin -> external (exact-origin rule).
    expect(classifyHref("https://www.example.com/x", origin)?.internal).toBe(false);
  });

  it("treats a scheme-relative //other URL as external", () => {
    expect(classifyHref("//other.example.com/x", origin)).toEqual({
      href: "https://other.example.com/x",
      internal: false,
    });
  });

  it("never marks mailto internal", () => {
    expect(classifyHref("mailto:a@b.com", origin)).toEqual({
      href: "mailto:a@b.com",
      internal: false,
    });
  });

  it("drops dangerous schemes with or without a page origin", () => {
    expect(classifyHref("javascript:alert(1)", origin)).toBeNull();
    expect(classifyHref("data:text/html,x", origin)).toBeNull();
    expect(classifyHref("javascript:alert(1)")).toBeNull();
  });

  it("without a page origin, rejects relative and never flags internal (legacy)", () => {
    expect(classifyHref("/admin")).toBeNull();
    expect(classifyHref("https://x.com")).toEqual({ href: "https://x.com", internal: false });
  });
});

describe("internal vs external links in rendered markup", () => {
  const origin = "https://app.example.com";

  it("renders a same-origin link without target and marks it internal", () => {
    expect(renderInlineMarkdown("[admin](/admin)", origin)).toBe(
      '<a href="https://app.example.com/admin" data-specpin-internal="">admin</a>',
    );
    expect(renderInlineMarkdown("[admin](https://app.example.com/admin)", origin)).toBe(
      '<a href="https://app.example.com/admin" data-specpin-internal="">admin</a>',
    );
  });

  it("keeps cross-origin links opening in a new tab", () => {
    expect(renderInlineMarkdown("[ext](https://other.com)", origin)).toBe(
      '<a href="https://other.com" rel="noopener noreferrer" target="_blank">ext</a>',
    );
  });

  it("renders internal links inside a description block", () => {
    expect(renderMarkdownBlock("see [users](/admin/users)", origin)).toBe(
      '<p>see <a href="https://app.example.com/admin/users" data-specpin-internal="">users</a></p>',
    );
  });

  it("without a page origin, every link still opens in a new tab (back-compat)", () => {
    expect(renderInlineMarkdown("[docs](https://x.com)")).toBe(
      '<a href="https://x.com" rel="noopener noreferrer" target="_blank">docs</a>',
    );
    // Relative links remain dropped to literal text without a base origin.
    expect(renderInlineMarkdown("[admin](/admin)")).toBe("admin");
  });
});
