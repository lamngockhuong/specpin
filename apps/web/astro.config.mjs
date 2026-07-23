// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

// Custom domain serves at the apex path, so base stays "/".
export default defineConfig({
  site: "https://specpin.ohnice.app",
  base: "/",
  // Images are SVGs (logo, favicon) plus the hero PNG screenshot. None need
  // raster re-encoding, so skip the Sharp-backed image service entirely (keeps
  // Sharp out of the dependency tree). Revisit if images need resizing/format
  // conversion at build time.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "Specpin",
      customCss: ["./src/styles/custom.css"],
      // Footer: append a branded, localized site footer below Starlight's
      // built-in prev/next + edit-link block.
      // Header: mirrors Starlight's default header and adds a compact
      // theme/language popover for mobile splash pages (no sidebar => no
      // hamburger fallback for those controls). See the component's header.
      components: {
        Footer: "./src/components/Footer.astro",
        Header: "./src/components/Header.astro",
        // Adds <ClientRouter /> for smooth client-side navigation (no full-page
        // reload / white flash between pages). See the component's header.
        Head: "./src/components/Head.astro",
      },
      logo: { src: "./src/assets/specpin-icon.svg", alt: "Specpin" },
      favicon: "/favicon.svg",
      // Social-share + favicon fallback tags. Starlight emits og:title/
      // og:description/twitter:card per page; we add the static share image.
      // og:locale is intentionally omitted: the head is global, so a static
      // locale tag would mislabel the /vi/ subtree.
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", href: "/favicon.ico", sizes: "any" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://specpin.ohnice.app/og.png" },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "https://specpin.ohnice.app/og.png" },
        },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
      ],
      // EN at the root, VI mirrored under /vi/. The language switcher pairs
      // pages that share a slug across these locales.
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        vi: { label: "Tiếng Việt", lang: "vi" },
        ja: { label: "日本語", lang: "ja" },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/lamngockhuong/specpin",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/lamngockhuong/specpin/edit/main/apps/web/",
      },
      // Fail the build on broken internal links (the docs integrity gate).
      plugins: [starlightLinksValidator()],
      // End-user docs IA. Group labels are localized for VI; page labels come
      // from each page's own frontmatter title (localized in the vi/ mirror).
      sidebar: [
        {
          label: "Getting started",
          translations: { vi: "Bắt đầu", ja: "はじめに" },
          items: [
            { slug: "guide/introduction" },
            { slug: "guide/install" },
            { slug: "guide/getting-started" },
          ],
        },
        {
          label: "Using Specpin",
          translations: { vi: "Sử dụng Specpin", ja: "Specpinを使う" },
          items: [
            { slug: "usage/connecting-projects" },
            { slug: "usage/viewing-specs" },
            { slug: "usage/capturing-and-editing" },
            { slug: "usage/graph-views" },
            { slug: "usage/settings" },
          ],
        },
        {
          label: "Concepts",
          translations: { vi: "Khái niệm", ja: "コンセプト" },
          items: [
            { slug: "concepts/how-it-works" },
            { slug: "concepts/security-and-privacy" },
          ],
        },
        {
          label: "Serving your specs",
          translations: { vi: "Phục vụ đặc tả của bạn", ja: "specを配信する" },
          items: [
            { slug: "sidecar/cli" },
            { slug: "sidecar/spec-format" },
            { slug: "sidecar/ai-authoring" },
          ],
        },
        {
          label: "Help",
          translations: { vi: "Trợ giúp", ja: "ヘルプ" },
          items: [{ slug: "help/troubleshooting" }, { slug: "help/privacy-policy" }],
        },
      ],
    }),
  ],
});
