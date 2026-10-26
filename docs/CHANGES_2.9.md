# Nexus 2.9.0

Date: 2026-10-26

- The answering WebRTC peer adopts the transceivers associated with the remote offer before creating its answer. Pre-created local slots are retired instead of keeping microphone, camera and screen tracks on unnegotiated senders. Separate MID mapping, polite collision handling, early ICE queues and capture permissions remain in place.
- Local-only microphone/received-audio analysis adds a speaking outline and animated bars. Quiet/muted peers remain quiet; leaving disconnects analysers without stopping another caller's tracks. Reduced motion disables the animation.
- GIF picker rows retain a fixed preview/title height. Loading more results grows the internal scroller instead of squeezing every thumbnail into a strip. Duplicate provider IDs are ignored, pagination must advance, and a changed query starts a fresh page.
- Category headings display uppercase. The redundant Channels heading is removed.
- The in-app video viewer fits the video and native playback/volume controls inside its viewport. Video does not require a nested scrollbar. Image zoom and original-file download policy remain unchanged.
- Reconnection errors use the floating red notice system instead of moving the chat with a full-width bar. Repeated failures are coalesced until a connection returns.
- Consecutive text messages use a 24-pixel line height at the normal 16-pixel font and no artificial vertical padding inside the group. Mentions share the content column and their colored block has balanced padding.
- Mobile chat tools remain on the title row. On small DM headers, call actions are available in the existing More conversation actions menu. Voice presentation and thumbnails use a single-column, bounded mobile layout with wrapping call controls.
- Settings > Account includes a copyable permanent Account ID and creator-link status. CREATOR_SETUP.md explains existing MaxUltimat3 accounts, another existing username and first-install registration. No new public creator-claim or badge-edit endpoint is added.

No dependency or database migration is required. The original license and legacy files are retained. The GIF browser test uses a controlled provider response, not a user's API key. Physical iPhone Safari acceptance and cross-network audio/video with an actual TURN relay remain deployment checks; see VALIDATION.md and VOICE_DEPLOYMENT.md.
