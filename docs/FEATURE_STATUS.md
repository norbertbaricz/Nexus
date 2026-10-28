# Request coverage · Nexus 2.35.0

| Area | Current behavior |
| --- | --- |
| Identity | Sign-in first; optional @ username; exact passwords; registration; immutable username; editable display name; account deletion; creator ID binding |
| Account recovery | Current-password enrollment; private pending/verified email; saved codes; host-only assisted links; single-use resets and session revocation |
| Profiles | Positioned avatar/banner uploads; GIF support; bio/pronouns; account badges; server roles; presence rings |
| Emoji & GIF pickers | Local emoji search across categories; provider GIF search/paging; retained composer/search focus; visible-viewport sizing |
| Messages | DMs/server chat; Markdown; replies/grouping; typing names; unread markers; mentions; sounds; search; pins |
| Notifications | Per-device opt-in; encrypted Web Push while closed/locked where supported; sender/server/channel/excerpt details; spoiler-safe text; conversation links; DND/access/read/block gates; automatic activation confirmation; mobile live-worker fallback |
| Files | Up to 5 GiB; resumable chunks; previews; clipboard images; spoilers; galleries and in-app viewing; wheel image zoom and drag panning; contained video; automatic private H.264/AAC copies through host FFmpeg; durable backlog, bounded workers/cache; unchanged originals |
| Servers | Join/leave/discovery; official community ID; artwork; rules; invites; deletion and ownership handling |
| Channels | Text, announcement, forum, media, voice and stage; categories, ordering, icons and permissions |
| Roles | Ordered roles; grants/denials; member grouping; separate role presentation in profiles |
| Call navigation | Green sidebar card on desktop; reserved footer below the composer on phones; muted live screen/camera preview while still connected; stream cycling; return and disconnect |
| Moderation | Kick/ban; timed/permanent restrictions; mute countdown; voice/stage disconnection; blocking |
| Calls | Independent camera/screen tracks; offered-slot negotiation without speculative stop loops; stage restrictions; per-peer mute/deafen gates and icons; speaking overlays above video; one tile-action row; separate mobile media scrolling; incoming calls |
| Devices | Automatic input permission requests through use; attached input/output/camera selectors; screen-quality menu; Voice & video settings; live camera orientation refresh; local account preferences |
| Quality | 480p–4K; 15/24/30/60 FPS; automatic high-quality budgets and manual ceilings through 40 Mbps |
| Listening audio | Per-person 0–200% gain; local mute/reset; account/device storage; member/message context actions |
| Context menus | Server/channel/category/DM/member/message/forum/file/artwork actions; keyboard and touch; permissions and confirmations |
| Mobile keyboard | Fixed dark canvas; bounded first hydration; layout/visual event-order clamps; root-pan repair; Send/attachment/picker focus retention; installed-site metadata |
| Layout | Equal composer controls and text baselines; resizable panels; one-row local profile; balanced call controls; stable footer-anchored toasts; hidden scrollbar chrome on compact editors/tab rows; scrollable settings; themed menus; gestures |
| Link previews | Official Nexus card/logo; public server-rendered metadata; trusted origin/tunnel support |
| Preferences | GIF stills and interaction playback; offscreen/background pause; sixteen dark palettes; account-synced appearance/sounds/motion; local hardware and layout |
| Navigation history | Durable per-account/browser DM, section and server/channel history; current-access validation; no automatic voice/stage join |
| Updates | Manual ZIP replacement; source checks; startup diagnostics; page version; server-build refresh; reload confirmation without duplicate update toast |
| Community recovery | Explicit setup-community.bat and original editable Skypixel Framework bundle |

This package targets the website and its persistent Node/SQLite service. Browser API support determines capture/output availability. Real throughput needs HTTPS/TURN and physical-device checks. Native applications, app stores, background call services and an SFU are outside this package. See [validation](VALIDATION.md) and [voice deployment](VOICE_DEPLOYMENT.md).

Email recovery needs a configured SMTP sender and a previously verified address. Codes need to be generated and saved before losing access. See [account recovery](ACCOUNT_RECOVERY.md).

A private host recovery tool handles independently verified owners who have lost both recovery methods. A saved but unverified address cannot reset a password. See [context menus](CONTEXT_MENUS.md) and [account recovery](ACCOUNT_RECOVERY.md).
