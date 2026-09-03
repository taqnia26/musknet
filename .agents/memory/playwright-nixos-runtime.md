---
name: Playwright runtime on NixOS
description: Browser dependencies required for persistent Playwright tests in this Replit workspace.
---

Playwright's downloaded Chromium binary is not sufficient on its own in this workspace; the Replit Nix configuration must include Chromium's shared-library dependencies, including GLib, GTK, NSS, X11 libraries, and libxkbcommon.

**Why:** Playwright downloads the browser binary but does not supply the host shared libraries required by Chromium on NixOS.

**How to apply:** When upgrading Playwright or changing browsers, preserve the browser runtime packages in the Replit Nix configuration and confirm the browser can launch before diagnosing test code.