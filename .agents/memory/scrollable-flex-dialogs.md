---
name: Scrollable flex dialogs
description: Reliable internal scrolling for dialogs with fixed headers and footers.
---

In a height-constrained flex-column dialog, use a native `min-height: 0; flex: 1; overflow-y: auto` content region between non-shrinking header and footer siblings when the shared Radix ScrollArea viewport expands to the content height.

**Why:** The Radix root can have the correct constrained height while its `height: 100%` viewport still resolves to the full content height, leaving lower fields clipped and the custom scrollbar absent.

**How to apply:** For long admin forms that must keep actions visible, use the native overflow region and the global scrollbar theme unless the Radix viewport is independently verified to have `clientHeight < scrollHeight`.