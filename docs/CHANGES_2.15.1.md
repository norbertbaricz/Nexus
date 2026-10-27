# Nexus 2.15.1 — consistent client upgrades

Date: 2026-10-27

The latest phone screenshot showed two close actions, a narrow filename and an image too large for its stage. The same failure was reproduced with the new viewer module and the older application/styles. This release corrects the client-delivery boundary so independently cached files cannot mix on a newly loaded page.

- The server retains one complete JS/CSS snapshot per process. The HTML entry points use a shared path derived from that snapshot's content; native relative module imports stay inside the same build.
- HTML uses `Cache-Control: no-store`. Build assets are immutable and support conditional requests and HEAD. Old unversioned entry URLs redirect to the current build without caching the redirect.
- A running process keeps serving its original snapshot if files change on disk. A restart creates the updated snapshot and its new URLs, including when only CSS changed. Unknown builds and missing modules return an explicit non-HTML error instead of silently serving another version.
- The existing 2.15 viewer layout remains: one close action, equal 44-pixel controls, a separate phone toolbar, centered contained media and bounded captions. No viewer redesign, account migration or dependency change is included.

## Update

1. Stop Nexus completely.
2. Copy all updated application source files together, preserving `.env` and `data/`.
3. Run `npm ci` and `npm start`, then reload the browser page.

The Node process must restart because it retains its client snapshot. No account reset or personal community import is needed. See [VALIDATION.md](VALIDATION.md) for the reproduced failure, upgrade checks and device limits.
