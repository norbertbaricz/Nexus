# Nexus 2.8.0

Date: 2026-10-26

- Jump to latest responds to meaningful chat history distance or unread content. Clicking/tiny scrolling/short conversations do not create a false indicator; forum/gallery boards have no chat jump button.
- Q&A and Resources are removed. The schema-8 migration converts existing channels to Forum/Media once and preserves IDs, names, permissions, roots/replies, files, covers and pins.
- Notices float without moving the workspace. Placement prefers measured gaps between active controls, with close and swipe dismissal.
- Avatar/banner/server/role/forum-cover artwork and image-attachment previews have a manual position/zoom editor. Dragging, sliders, Reset, Apply and existing-image Adjust controls preserve original bytes and animated GIFs.
- CSS viewport sizing handles orientation directly; overlay keyboards reserve space only while editing. Mobile controls include safe-area spacing and remain inside tested viewport bounds.
- Right-swipe replies to a message; left-swipe or long-press opens its actions. Drawers, notices, sheets and unzoomed images retain their gestures. Vertical scrolling remains native and all gesture actions retain buttons.
- Rules use a larger styled Markdown view. Messages, captions, biographies, descriptions and welcome text share safe formatting. Identity/navigation labels remain plain text.
- Channel and role icons use visual grids. Other selectors use themed, keyboard-accessible menus with type-ahead and Escape.
- Profile order is display name/badges, username · pronouns, biography, contextual server roles, Here since. DM profiles omit server roles and role headers no longer repeat the server name.
- Forum has independent account-synced Grid/List layouts and a New post publishing dialog with optional media/files. Clicking a post opens its conversation. Long titles are clamped only in summaries.
- Media accepts documents as well as images/video/audio. Every attachment supports a spoiler flag; hidden items reveal explicitly and reset on navigation.
- Attachment preview actions have a fixed column; image hover frames match image bounds. Emoji choices are larger, as are reactions and emoji-only messages.
- Presence uses continuous colored outlines. Enabled role groups follow saved order, each online member appears once under their first displayed role, and all offline members share Offline. The owner display entry has its own toggle/order without granting permissions.
- Consecutive recent mentioned messages join their background corners into a continuous highlight.

The 25-capability model, 5 GiB disk-backed uploads, immutable usernames, creator identity, blocks, authenticated files, stable presence updates, pin receipts and original license/legacy data remain intact. Forum layout is the eighth portable account preference. No new dependency is required.

See FEATURE_STATUS.md for all 19 requests, VALIDATION.md for actual checks, and SECURITY.md/VOICE_DEPLOYMENT.md for deployment boundaries. Back up and preserve `data/` and `.env`, replace code, run `npm ci`, restart, then force-refresh browser assets. The ZIP contains no QA server, runtime database, real environment values or installed dependencies.
