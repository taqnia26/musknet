---
name: pnpm workspace rewrites
description: Preserve workspace package safety settings after dependency changes.
---

An otherwise ordinary package addition can rewrite the workspace YAML, reorder keys and overrides, and remove comments around the minimum package release-age policy. Review that diff after changing dependencies and preserve the original security rationale and effective settings.

**Why:** The package manager's normalization produced broad unrelated configuration churn while adding a single already-cataloged dependency.

**How to apply:** When adding a package to a workspace artifact, compare the workspace YAML and lockfile before delivery; restore unrelated configuration changes rather than accepting them as part of the feature.