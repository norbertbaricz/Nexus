# Nexus 2.16 — remember each server's channel

Date: 2026-10-27

Selecting a server previously always opened general or its first channel. Each server now restores the channel last selected there, independently of other servers and the remembered DM.

- Text, announcements, forums, media galleries, voice and stage selections are remembered by channel ID. Renaming, moving or reordering a channel retains the selection.
- Switching to Messages or another server keeps every server's selection. The existing navigation snapshot stores the history per account in the current browser tab, including across reloads.
- Workspace updates remove entries for deleted channels, lost channel access and servers the account no longer belongs to. First visits and invalid entries use the existing general/first-channel fallback; empty servers show their overview.
- Returning to a remembered voice/stage page uses the existing non-joining navigation path. An ongoing call stays managed by the existing call object. Explicit channel clicks retain their current join behavior.
- Existing last-DM behavior remains intact. Legacy navigation records work without a reset and gain server history as channels are opened.

No dependencies, permissions or database schema were changed. Client asset versioning from 2.15.1 remains in place. See [VALIDATION.md](VALIDATION.md) for actual checks.

## Update

Stop Nexus, copy all updated application source files while preserving `.env` and `data/`, run `npm ci` and `npm start`, then reload the browser page. No personal server setup or database reset is required.
