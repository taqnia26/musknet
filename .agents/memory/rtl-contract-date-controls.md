---
name: RTL contract date controls
description: Why uploaded-contract date fields use visible ISO text and a calendar rather than browser-native date segments
---

Native browser date controls can render Arabic-localized segments even with an English `lang` and LTR direction. In the RTL contract dialog, those segments overlapped the shared input's placeholder when focused; changing direction alone did not make the display stable. Show an explicit Gregorian `YYYY-MM-DD` text value with a separate calendar picker, and validate typed dates strictly.

**Why:** The browser can choose native date segment language independently of the input's `lang`, while the backend expects calendar days without a timezone conversion. The chosen day must not shift or become ambiguous.

**How to apply:** For future contract-term date edits, preserve ISO day strings and optional blanks through form state and requests. If changing the calendar UI, inspect both empty and selected states on narrow RTL screens, including the open picker.