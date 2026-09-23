---
name: Contract storage provider paths
description: Why contract object paths must retain their storage-provider identity across deployments.
---

Keep a distinct namespace for local-disk contracts and Replit App Storage contracts, even if the API returns the same `/objects/` shape for both.

**Why:** A database export can retain historical contract paths while a new private-server deployment writes to disk. Choosing the provider only from the current environment would silently route old rows to the new disk and make them appear missing.

**How to apply:** When extending contract storage or planning a migration, dispatch reads and deletes by each persisted path's namespace; don't reinterpret legacy paths based on whichever provider is currently configured.