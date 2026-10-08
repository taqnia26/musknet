---
name: Invoice presentation scope
description: User's reference-layout and publication boundaries for local customer invoices
---
The user requires one global invoice design, applied to locally generated old and new invoices visually. Imported external originals and already-sent email PDFs are outside its scope. Reference-template groups stay in their physical locations: seller left/logo right, buyer left/invoice details right; Arabic text inside each group is RTL. The user subsequently requested removing the notes section from presentation and moving totals/payment summary to its former position on the left.

**Why:** The supplied invoice image is a binding reference, not inspiration. The user explicitly separates visual publication from financial issuance, numbering, tax calculations and accounting.

**How to apply:** Preserve these boundaries in future template/editor changes, including English layouts and historical/cancelled records. Do not broaden a visual change into invoice data migration or attachment replacement.

The user wants the previous formal invoice font, no «تسجيل فاتورة سابقة»
heading, and their supplied logo clearly centered at the bottom with
`muskellolo.com` beneath it.

**Why:** The user rejected the replacement calligraphic font and the tiny footer
mark. Historical status must remain accurate even when its heading is removed.

**How to apply:** Preserve the actual old Arabic appearance (Tajawal), not an
assumed font inferred from a missing font asset. Keep the footer readable in
printed A4 output and reserve its space in pagination.

Currency symbols/codes must appear physically to the LEFT of the number throughout
all invoices and the system, in Arabic and English.

**Why:** The user explicitly repeated this requirement after screenshots showed
the currency on the right.

**How to apply:** Isolate monetary groups from surrounding RTL text, place the
symbol/code first in an LTR row and preserve the number's own LTR direction,
including zero and negative values. Cover preview, print, PDF and email.

The user also requires removing the printed «سجل داخلي لفاتورة سابقة» notice, using «رقم الفاتورة» instead of «المرجع الداخلي», and printing only the system's invoice number rather than the original external number. After seeing the enlarged footer, the user requested reducing that enlarged logo by 30% and enlarging the website text below it. Short invoices must keep their totals on the first page when there is room.

**Why:** The user supplied a PDF screenshot showing an unnecessary second page, a tiny footer logo, and unwanted historical-reference wording.

**How to apply:** These are presentation requirements, not permission to change historical status, stored numbers, tax treatment or original external documents. Keep cancellation notices and never invent a historical ZATCA QR or new tax issuance. The design editor must allow deletion and restoration of optional layout elements.

The user subsequently requested removing printed collection status, collected and outstanding amounts, and QR entirely. Shipping details must be hidden by default and included only when the issuer explicitly enables «إظهار الشحن في الفاتورة» for that invoice.

**Why:** The user marked these exact sections in the corrected preview and explicitly requested their removal and an opt-in shipping control.

**How to apply:** Keep payment records and tax QR data in the system; this is a document-presentation rule, not data deletion. Persist the choice per invoice and apply it across preview, PDF, print and emailed attachments. Test opted-in shipping and default-hidden shipping; shipping must not force an unnecessary new page.