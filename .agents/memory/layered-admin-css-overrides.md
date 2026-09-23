---
name: Layered admin CSS overrides
description: Why scoped document palettes need to share Tailwind's base layer to beat admin utility overrides.
---

Keep scoped document-style overrides in Tailwind's `base` layer when they must supersede existing `!important` admin theme rules.

**Why:** Important declarations in a CSS cascade layer outrank important declarations outside layers, regardless of later source order or greater specificity. Merely appending an unlayered `!important` invoice palette made the invoice surface inherit the dark admin card background even though the new rules appeared later and were more specific.

**How to apply:** When a document embedded in the admin route must retain independent light/dark/print colors, match the layer of the competing admin rules, scope selectors tightly to the document, and verify computed browser colors rather than only inspecting CSS source.