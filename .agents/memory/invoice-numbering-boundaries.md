---
name: Invoice numbering boundaries
description: Owner's prefix request and non-negotiable preservation and approval boundaries
---
The owner requests M for new individual invoices and ML for new company/distributor invoices, retaining the separator, padding and sequence behavior unless a concrete reason is reported. Issued invoice numbers and original invoice numbers, historical and reconciled invoices, must never be rewritten. Order numbers are out of scope. Exhibition prefixes have not been specified and must remain unchanged.

**Why:** The owner's supplied numbering brief explicitly separates new issuance from existing financial records and leaves the choice of shared versus independent counters to the owner and accountant.

**How to apply:** The owner explicitly approved option A: keep the single global counter, separator, padding, uniqueness and race protection; change only prefixes of newly issued individual and company/distributor invoices. Historical registrations that reserve an internal reference retain their existing behavior. Existing INV/LC numbers remain valid everywhere. Never weaken uniqueness or accounting-integrity protections. If introducing prefix checks, match the complete prefix and separator, not a bare M that would also match ML. Any required production SQL must be shown in full for owner review and applied by the owner, not the agent.

The user's later visual correction asks for four-digit invoice-number display and removal of redundant leading zeros, e.g. LC-000005 displayed as LC-0005.

**Why:** The user explicitly rejected the six-digit visual padding in the system/PDF.

**How to apply:** Treat this as display formatting, keeping stored identifiers and the global counter intact. Never truncate significant digits beyond four, and allow searching by the shortened display as well as the stored number. External original documents and order identifiers are outside this formatting request.