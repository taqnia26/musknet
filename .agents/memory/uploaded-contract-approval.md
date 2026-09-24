---
name: Uploaded contract approval
description: Why uploaded signed contracts need reviewed invoice terms before automatic company billing
---

For signed contracts uploaded as files, associate the document with the company explicitly selected during upload. Do not derive a company or financial terms from the filename or infer binding invoice values directly from OCR. Let staff enter and confirm the contract type, discount, payment rule, and dates once, including for files uploaded earlier; only then may the sole applicable contract drive invoices automatically.

**Why:** The user chose one-time manual entry for these terms. Signed files may be scanned images with no text layer, and a misread discount or payment due date would silently alter financial records. Existing invoices must retain their original snapshots.

**How to apply:** When changing uploads or invoicing, keep approval explicit and scoped to the selected company ID, protect concurrent approval and invoice issuance from inconsistent source reads, and preserve issued invoice amounts and source snapshots.