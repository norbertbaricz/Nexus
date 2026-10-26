# Nexus development roadmap

## Current behavior

A new user registers, receives a secure session and enters a real, initially empty workspace. Communities, direct messages and files use the Node.js server and SQLite. Voice and video use WebRTC with Socket.IO signaling. A new process can read the saved account and conversation history. Server icons and banners, original local sounds, adjustable volume and optional interface animations are implemented. Version 2.8 simplifies channel types, adds saved image positions, forum publishing/grid-list choices, document spoilers and ordered member display, and refines floating notices, gestures and mobile viewport behavior. The registry and additive schema are extension points; they are not a guarantee that future scaling or product requirements need no migration.

## Reliability and release preparation

1. Validate the chosen Node.js hosting, HTTPS proxy and persistent storage. Test WebSocket upgrades and shutdown behavior.
2. Provision TURN with expiring credentials, then test calls across two real devices, browsers and restrictive networks.
3. Add email verification, password recovery, account deletion and device/session management.
4. Add reporting, community deletion and per-channel action overrides on top of the 25-capability server/role model.
5. Add per-account storage quotas, content moderation and appropriate file scanning.
6. Add operational metrics, rate-limit storage, scheduled backups and restore tests.
7. Review the product name, dependencies, policies and brand assets before public launch.

## Product depth

1. Friend requests, group conversations, delivery acknowledgements and read receipts.
2. Richer discovery filters, an authority hierarchy where required and a visual permission explanation for individual members.
3. Native desktop/mobile packaging, push notifications and background calls.
4. Extend the current eight-key account preference sync with explicit conflict UX if future settings become shared documents; device geometry and OS permissions should remain local.

## Scale

1. Use an SFU before increasing voice-room sizes.
2. Benchmark real traffic and storage growth before migrating database or media architecture.
3. Add a shared Socket.IO adapter, distributed rate limits and a multi-instance deployment strategy.
4. Treat end-to-end encryption as a separate protocol and key-management project.

## Legacy migration

Verify account ownership before mapping old browser IDs to real accounts. Preserve message participants, authorship, timestamps and attachments during import.
