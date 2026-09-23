---
name: Baileys restart-required pairing
description: Handling WhatsApp status 515 during QR pairing without losing the newly registered session.
---

Treat Baileys disconnect status 515 (`restartRequired`) as a transitional pairing event, not a final connection failure. Serialize and await pending credential persistence before reconnecting with the saved authentication state.

**Why:** After a QR scan, Baileys may emit updated registered credentials and then immediately close with 515. Reconnecting before the asynchronous credential write finishes reads stale unregistered state and leaves the UI disconnected.

**How to apply:** Keep credential writes ordered per socket, await the write chain in the close handler, suppress 515 as a user-facing error, and reconnect promptly without clearing authentication. Retain ownership of the closing socket until credential writes complete; otherwise a concurrent status poll can start a new connection from stale credentials and invalidate the close handler's reconnect.