---
name: PDFKit bundle runtime helpers
description: Runtime dependency requirement when bundling PDFKit and fontkit into the API server.
---

When PDFKit/fontkit is bundled for the production-style API start command, declare `@swc/helpers` as a direct runtime dependency of the server package.

**Why:** Type checking and tests can pass while the built server crashes at startup because fontkit requires `@swc/helpers/cjs/_define_property.cjs`, which is not guaranteed to be reachable as a transitive dependency under pnpm.

**How to apply:** After adding or upgrading PDF generation dependencies, verify the built `start` command through the managed workflow, not only source-mode tests.

PDFKit also loads built-in AFM font metrics relative to its own package directory during document construction. Externalize `pdfkit` from esbuild instead of bundling it into the server entrypoint, or the built server can start successfully yet fail only when generating a PDF. Require an available Arabic TrueType font for Arabic contracts and verify actual `%PDF-` bytes through the built server route.