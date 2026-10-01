---
name: Destructive-action audits
description: Audit alternate edit-form paths as well as explicit destructive controls.
---

When confirming a destructive-action audit is complete, check every UI path that can submit the same destructive payload, especially edit-form Save as well as a quick Hide/Disable action.

**Why:** A confirmation on a quick visibility toggle previously left an edit-form visibility switch and Save able to perform the identical change immediately. Reviewing only named destructive buttons missed this bypass.

**How to apply:** For saved status, activity, visibility, cancellation, and return fields, inspect all submission handlers. Confirm only transitions that change the saved state destructively, capture the full validated payload, and leave the draft untouched when the operator cancels. Do not add a second prompt over an already-confirmed path.