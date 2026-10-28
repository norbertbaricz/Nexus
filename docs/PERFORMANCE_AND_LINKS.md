# Link previews and animated media

## Sharing Nexus

The initial HTML contains the official project title, description, canonical origin, Open Graph image dimensions/alternative text and a large-image social card. Crawlers do not need an account or JavaScript. `/assets/nexus-share.png` is 1200 × 630; the PNG and touch icons use the existing official mark. No private user or server image is made public for this feature.

Set `PUBLIC_ORIGIN` in the private `.env` to the real HTTPS origin and restart the active Nexus process. For ngrok, use the exact current public origin with no path or invitation parameters. Update it when the deployment address changes, including because recovery email links also use it. An unset origin falls back to a validated direct HTTP Host header, with HTTPS for public hosts and HTTP only for local loopback. Forwarded hosts are ignored by preview generation. Invalid configured origins do not become HTML/URL injection.

The source page is not cached and the image URL contains its content revision. Messaging services control the final card layout, whether images are enabled and their own preview caches; Nexus cannot force an old sent message to redraw. After updating, share the current link again. ngrok's own free-plan browser interstitial is separate from Nexus's card and remains controlled by ngrok.

## Motion controls

Open Settings → Preferences and disable Animations. Uploaded GIFs, artwork, message/file previews and provider results use still sources. A mouse hover, keyboard focus or press can play an individual image; leaving it freezes it again. On touchscreens, a press previews motion while the existing tap/viewer and hold/context actions continue to work. The operating system's reduced-motion setting is respected even with the account option on. Offscreen images, hidden browser tabs and content made inert by dialogs pause regardless of the normal animation setting.

For uploaded images, the browser captures a loaded frame into a smaller static preview. GIFs have no native pause/resume API, so playback can restart from the beginning when returning to the original URL. The still preserves image proportions and saved crop positions. Downloaded originals, animation frames, upload data and server files are unchanged. In reduced motion the still resolution is capped; the original remains available during interaction. Hidden spoilers are not decoded by this controller until the existing reveal action creates their image.

GIPHY supplies static renditions through its API. New GIF messages retain a validated still reference and use it in chat, forum/gallery, composer and viewer. Legacy provider references can request a matching still through the signed-in browser using the configured public web key. Failure displays a static GIF tile rather than continuing autoplay. All provider requests remain direct client requests; source/query parameters returned by the API are preserved. The UI cannot make a remote provider available when the host has no valid key or the provider is unreachable.

## Resource limits

`public/animated-media.js` centralizes the still limits: two simultaneous jobs, 48 cached entries, a 12 MiB encoded-string budget, 1280 maximum edge and a 1280 × 720 pixel budget. Connected image nodes can additionally hold their currently displayed still; these values are not a total browser-memory guarantee. Nodes and pointer hosts are released when removed, the cache is cleared between account screens and late jobs cannot repopulate it. Source reconciliation avoids restarting GIFs during status, unread or reaction updates. Pointer/focus handlers inspect relevant ancestors rather than scanning every image.

The reduced-motion stylesheet also limits repeating animations to one cycle and removes large backdrop blur layers. Scripts/styles support precompressed Brotli and gzip with content negotiation, variant-specific validators, immutable build URLs and uncompressed fallback. Compression happens at startup, not for every request. `server/public-assets.js` centralizes its thresholds and compression levels. Private file caching rules are unchanged.

These changes reduce recurring media/compositing work and UI transfer size. They do not establish a frame-rate guarantee on every phone or a measured improvement for a particular user's device. Tunnel latency, large uploads, decoding very large originals, server capacity and WebRTC throughput are separate factors. No live ngrok/VPS measurement, real GIPHY-key request or physical iPhone/Android test is part of this archive's automated checks.

## Reference protocols

- [Open Graph protocol](https://ogp.me/)
- [GIPHY rendition objects](https://developers.giphy.com/docs/api/schema/image-object/)
- [GIPHY best practices](https://developers.giphy.com/docs/api/best-practices/)
- [ngrok free-plan browser interstitial](https://ngrok.com/docs/pricing-limits/free-plan-limits)
