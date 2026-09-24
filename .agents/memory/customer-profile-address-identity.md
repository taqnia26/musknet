---
name: Customer profile address identity
description: Why a customer’s manually captured profile address must not depend on storefront default shipping state.
---

The intake profile address has its own stable identity. Never use a shopper's currently default shipping address as a proxy for that profile record, and do not let storefront address deletion remove it.

**Why:** Storefront users can choose a different default shipping address later; that changes the default marker without changing the address originally recorded at intake. Tying admin profile read-back to the default silently replaces or loses the original details.

**How to apply:** When changing address selection, deletion, or admin customer read-back, preserve the distinction between a profile address and a shopper-selected default address. Keep historical shopper addresses valid without retroactively requiring profile metadata.