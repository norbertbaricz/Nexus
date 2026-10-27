# Nexus 2.15 — aligned media viewer

Date: 2026-10-27

The image, video and audio dialog now shares a single responsive layout. The supplied phone screenshot showed an image attached to the top of a much taller stage, a squeezed filename and uneven toolbar controls. Earlier viewer-specific overrides were consolidated.

- Images and native video/audio players are centered horizontally and vertically. Unzoomed media is contained directly by CSS, including during viewport and stage-size changes.
- Zoom out, Fit, Zoom in and Close use matching 44-by-44-pixel boxes with centered contents. Download shares their height; on phones it becomes a named 44-pixel icon button.
- Desktop keeps the filename, toolbar and Close in one row. Phones keep the filename and Close on their own row and use a separate toolbar below, with no absolute-positioned close control competing for space.
- Zoomed images expand into a scrollable stage without clipping away their top or left edge. Fit restores containment and clears zoom scroll offsets. Zoom buttons disable at their bounds, and video/audio do not respond to image zoom shortcuts.
- Captions have bounded scrolling and previous/next controls stay grouped. Items without captions or navigation do not create an empty footer.
- Video/audio playback pauses when changing items, closing the dialog or replacing it with another dialog. Resize observation is released on exit.

All existing download authorization, hidden-spoiler filtering, authenticated file paths and provider restrictions remain in force. No dependencies or database schema were changed. See [VALIDATION.md](VALIDATION.md) for actual checks and device limits.

## Update

Stop Nexus and copy the updated source into your installation, preserving `.env` and `data/`. Run `npm ci` and `npm start`. No personal server setup or database reset is required for this release.
