# Request coverage — Nexus 2.11

Date: 2026-10-26

This record maps the latest follow-up and the earlier 19-item request list to delivered behavior and actual evidence. Browser size checks and synthetic touch fixtures do not certify every physical device or operating-system keyboard. See VALIDATION.md for the distinction and deployment boundaries.

## Latest screenshot follow-up in 2.11

Settings action rows keep deletion beside the normal actions and retain warnings in confirmation dialogs. Server/account tabs are individual buttons without long underlines or redundant subtitles/sync-status text. Narrow composers use a one-line placeholder. Editable avatar/banner previews own their controls, with hover, keyboard and touch access. Activity shows readable actions, actor/target names and specific field changes. Personal Skypixel data is applied through an explicit local import; startup/registration stay generic. The personal upgrade retains five custom roles and transfers Best Tester members to Tester. See [CHANGES_2.11.md](CHANGES_2.11.md) and [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md).

## Latest screenshot follow-up in 2.10

Centered empty states; one discovery Create and one sidebar Join action; separate unsaved confirmations; a scrolling Markdown rulebook with section navigation; one ID-bound official community; data-driven Skypixel setup with original supplied artwork; owner-only server deletion; stable revealed spoilers through reactions; one-row compact headers; centered mobile call controls/dock; hide-versus-decline call behavior; no duplicate pins browser in message actions; untimed kick/disconnect; voice/stage removal permission; live mute countdowns and join restrictions; detailed ban rejection; permanent self-deletion. See [CHANGES_2.10.md](CHANGES_2.10.md), [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md) and [VALIDATION.md](VALIDATION.md).

## Follow-up refinements in 2.9

GIF rows/pagination, uppercase categories, a bounded video viewer, red floating reconnection notices, tighter text/mention spacing and one-row mobile chat headers address the seven screenshots. Voice negotiation adopts offered m-lines on the answerer, and local audio analysis provides speaking feedback. Settings > Account identifies the permanent account and creator status. Native remote-frame delivery did not pass in this QA environment; see CHANGES_2.9.md, CREATOR_SETUP.md and VOICE_DEPLOYMENT.md.

## Follow-up refinements in 2.8.2

Message groups use equal internal spacing for text and emoji, and the DM profile action is separated from the join date. Server unread activity appears in the global Servers indicator, joined-server totals and channel badges. Official-server markers remain visible. See CHANGES_2.8.2.md and VALIDATION.md.

## Follow-up refinements in 2.8.1

Profile and server artwork actions are grouped by image, with responsive Upload/Adjust/Remove rows. The typing label displays complete names in its own live region on desktop and mobile, independently of character counts and shortcut hints. See CHANGES_2.8.1.md and VALIDATION.md.

| # | Request | Delivered behavior and verification |
| --- | --- | --- |
| 1 | False Jump to latest on tiny scroll/channel entry | Clicks preserve live-follow; a meaningful distance/unread condition controls the indicator. Loading/short history stays clear, and Forum/Media boards have no chat jump control. Unit cases and real channel/viewport checks passed. |
| 2 | Remove Q&A and Resources | Both are removed from UI/API creation and conversion. Schema 8 converts existing Q&A to Forum and Resources to Media once, retaining IDs, names, permissions, history, threads, covers, files and pins. Migration/restart tests passed. |
| 3 | Floating notices without UI movement | Notices reserve zero layout height and prefer free gaps between measured controls. Before/after workspace/navigation/dialog geometry stayed identical. A saved-role notice no longer blocked the member-role checkbox; swipe/close work. |
| 4 | Manual image crop/position | Upload and existing-image editors for avatars, banners, server icons, role icons, forum covers and attachment image previews. Drag/position/zoom/reset/apply persist metadata without rewriting originals or flattening GIFs. Real native upload, drag and saved-position checks plus file-byte tests passed. |
| 5 | Small-device controls too low/crowded | CSS viewport sizing handles orientation; overlay keyboard sizing applies only while editing. Safe-area spacing and responsive header controls keep Send inside all eight tested viewports, including 320x480 and landscape. |
| 6 | More touch gestures, especially reply | Right swipe replies; left swipe/long press opens message actions. Drawers, sheet handles, notices and unzoomed image navigation retain gestures. Unit timers and production-handler fixtures passed; all retain button alternatives. |
| 7 | Better server rules and project-wide formatting | Larger styled rules dialog and shared safe Markdown for prose: messages, captions, bios, descriptions and welcome text. Headings/bold/lists/emoji shortcodes rendered in the actual rules view; injection/code/link tests passed. Identity labels remain plain text. |
| 8 | Visual channel icon selection | A 20-choice SVG grid replaces text-only icon dropdowns, with selection state, accessible names and tooltips. The role editor uses it too and preserves custom image icons. Native UI selection/save passed. |
| 9 | Old-looking dropdown menus | Themed portal menus preserve underlying form values and provide arrows, Home/End, type-ahead and Escape. Actual channel/role menus were checked; Escape leaves the settings dialog open. |
| 10 | Profile hierarchy | Display name/badges, @username · pronouns, bio, server roles, Here since. The role header does not repeat the server name; DM profiles omit server roles. Rendering/order tests passed. |
| 11 | Forum grid/list | Independent account-synced layout buttons, separate from Media layout. Real list switching and grid/list rendering checks passed. |
| 12 | Forum publishing with media, then chat | New post opens a publishing form with title/body and optional attachments. A real GIF spoiler post was created, opened and replied to in its own chat. Root/reply authorization tests passed. |
| 13 | Documents and spoilers in Media | File chooser/API/gallery accept documents alongside images/video/audio. Every attachment can be a spoiler. A real document was uploaded, published, revealed and shown with download controls; flags/reset behavior and invalid-file cases are tested. |
| 14 | Preview X outside the card | Preview buttons own a fixed action column. Actual image/document cards measured 264 pixels, with no overflow and every action fully inside their bounds. |
| 15 | Oversized image hover outline | Message image buttons fit their image instead of filling the message row; cropped previews use the same bounded frame. Hover uses a thin frame without changing layout. |
| 16 | Small emoji and reactions | Active-category emoji cells use 28-pixel glyphs/44-pixel height; actual Faces count remains bounded at 118. Reactions use 22-pixel glyphs in 36-pixel controls, and emoji-only messages are larger. Real picker/reaction measurements passed. |
| 17 | Continuous presence outline | Online/idle/DND/offline use a continuous 3.5-pixel colored outline with accessible status labels; DND/idle behavior is unchanged. |
| 18 | Role-based ordered member groups | Separate-display flags and owner-controlled display order. Each online member appears once under their first enabled role; remaining online users use Online and every offline user uses Offline. Actual creation, assignment, reorder and online-to-offline grouping passed, plus permission/persistence/unit cases. Order is visual, not a permission hierarchy. |
| 19 | Join consecutive mention highlights | Adjacent recent mentioned messages share their middle corners and retain one continuous background edge. Unit cases and real @here messages showed first-bottom/next-top radii of zero. |

## Earlier requests retained

| Area | Included behavior | Evidence / dependency |
| --- | --- | --- |
| Real accounts, sign-in first | Server-backed registration/session, no demo users; sign-in is the initial unauthenticated view | Authentication/persistence/proxy tests; prior browser QA |
| Original identity/readability | Original Nexus layout/assets, bundled readable Inter font, simplified Messages/Servers navigation | Existing branding/font notices preserved; no legal trademark clearance implied |
| Display name and immutable username | Username identifies contacts and cannot be changed; display name stays visual | Identity/impersonation tests |
| Creator and official server | Creator badge bound to account ID; creator-owned public Skypixel Framework server ranks first | Tests; fresh installation requires the private creator claim configuration |
| Profiles/server artwork | GIF avatars/banners/icons, full-frame images, fade/reduced-motion behavior, larger responsive profiles/settings | Upload/auth tests and retained browser QA |
| Upload size | 5 GiB per attachment/profile/server image; four message attachments; resumable chunks and progress/cancel | Sparse full-size boundary/range tests; no five-gigabyte network benchmark |
| Composer attachments | Clipboard image upload, previews, attachment spoilers, manual image positioning and native file selection | Retained paste fixture + real native uploads in 2.8 |
| Messages navigation | Start conversation switches to DM sidebar; last DM restored after section changes; empty on initial entry | Retained browser checks; current real DM flow |
| History/readability | Grouping, typing indicator, manual-history pause, new-message button, bounded pagination and 8,000-character validation | Unit/integration tests; old-pin and latest browser checks |
| Emoji/GIF | Bounded active emoji category, seven categories, searchable provider picker | Emoji browser/layout tests; live GIPHY needs operator key/quota |
| Server administration | Rules, invites, listing, channels, categories, roles, members, moderation and activity in server dropdown/settings | Actual HTTP/Socket.IO tests; no duplicate channel-create button |
| Categories/channel editing | Rename/reorder/collapse categories, reorder/move channels including uncategorized, custom channel icons and deletion | API tests and retained browser workflows |
| Channel types | Text, announcements, forum, media/files, voice and stage | Content/permission tests; Q&A/Resources migrate to Forum/Media without erasing history |
| Permissions | 26 capabilities, ordered member display, basic defaults, role Allow/Deny/Inherit, private channel visibility, independent voice capture | Route/live-revocation/delegation tests; future per-channel action overrides remain roadmap work |
| Moderation and membership | Kick, timed/permanent ban, temporary mute, server leave and ownership transfer | Integration tests |
| Blocking | Persistent account block hides accessible DM/server text, members, pins/reactions and peer media; unblock list | HTTP/live media/signaling tests; stored messages are preserved |
| Whole DM deletion | Explicit confirmed deletion removes conversation/history/files for both sides | Integration tests; permanent action remains explicit in UI |
| Discovery | Real opt-in public servers, joined servers sidebar, creator official ordering | Listing/access/ordering tests |
| Voice layout | Visible participant avatars/names, click to join, optional members panel, independent camera/screen, large presentation/fullscreen views | Browser layout and deterministic RTC tests; remote real-device media boundary below |
| Presence/sounds | DND silence, automatic idle with DND/offline exceptions, original soft fading local sounds, volume settings and mention cue | Presence/audio tests; browser audio requires a user gesture |
| Reconnection | Socket reconnect, fresh bootstrap/access checks, bounded media recovery, upload offset recovery and preference retry | HTTP/client/RTC tests; network conditions still affect availability |
| Image behavior | In-app viewer, bounded zoom, media grid/list, application image download only in DM/Media | Native viewer/download QA and route policy tests |
| Simplified controls | Inert logo, one personal settings entry, server name dropdown and hover/focus channel gears | Retained browser checks; touchscreen path retained |
| Responsive panels | Left/right resize limits, keyboard control, device-local widths and phone drawers | Boundary unit tests plus pointer/keyboard and six-size browser checks |
| Errors and abuse controls | Console diagnostics without message bodies/secrets, visible error notices, message/upload/socket limits and slowmode | Integration tests and error-path observations; limits are process-local |
| Full project ZIP | Complete source, lockfile/startup files, original legacy files and proprietary license | ZIP integrity and byte-preservation checks; no QA/runtime/private environment bundled |

## Boundaries that cannot honestly be marked complete

- A browser necessarily receives the web client and visible media. DevTools, screenshots or copying received bytes cannot be prevented. Server-only code, private configuration, databases and unauthorized files remain outside the public directory and behind access checks. Spoilers and download buttons are not DRM.
- Live GIPHY search requires the host's provider key and quota. Missing-key/failure handling, bounded search and validated references are implemented/tested; a live production-provider search was not certified here.
- Camera/screen/audio code is implemented, but decoded remote frames across two physical devices and networks were not verified in this environment. Deploy HTTPS, provision a working TURN relay and finish the deployment checks. The archive does not create a relay. Voice remains an eight-person mesh; larger rooms need an SFU.
- Native keyboard, rotation and gestures require testing on the actual supported phones/tablets. Six browser viewport sizes and synthetic touch events do not certify every device.
- Public-launch capacity, security audit, per-account storage quotas, content scanning, account recovery and end-to-end encryption remain the explicit ROADMAP.md work. No claim of 100% universal performance, complete anti-spam protection or future-proof infrastructure is made.
