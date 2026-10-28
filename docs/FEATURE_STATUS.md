# Request coverage · Nexus 2.23.0

| Area | Current behavior |
| --- | --- |
| Identity | Sign-in first; optional @ username; exact passwords; registration; immutable username; editable display name; account deletion; creator ID binding |
| Account recovery | Current-password enrollment; private pending/verified email; saved codes; host-only assisted links; single-use resets and session revocation |
| Profiles | Positioned avatar/banner uploads; GIF support; bio/pronouns; account badges; server roles; presence rings |
| Messages | DMs/server chat; Markdown; replies/grouping; typing names; unread markers; mentions; sounds; search; pins |
| Files | Up to 5 GiB; resumable chunks; previews; clipboard images; spoilers; galleries and in-app viewing |
| Servers | Join/leave/discovery; official community ID; artwork; rules; invites; deletion and ownership handling |
| Channels | Text, announcement, forum, media, voice and stage; categories, ordering, icons and permissions |
| Roles | Ordered roles; grants/denials; member grouping; separate role presentation in profiles |
| Moderation | Kick/ban; timed/permanent restrictions; mute countdown; voice/stage disconnection; blocking |
| Calls | Independent camera/screen tracks; stage restrictions; mute/deafen; speaking indicators; incoming calls |
| Devices | Automatic input permission requests through use; attached input/output/camera selectors; screen-quality menu; Voice & video settings; local account preferences |
| Quality | 480p–4K; 15/24/30/60 FPS; automatic high-quality budgets and manual ceilings through 40 Mbps |
| Listening audio | Per-person 0–200% gain; local mute/reset; account/device storage; member/message context actions |
| Context menus | Server/channel/category/DM/member/message/forum/file/artwork actions; keyboard and touch; permissions and confirmations |
| Layout | Resizable panels; one-row local profile; balanced call controls; scrollable settings; themed menus; gestures |
| Preferences | Sixteen dark palettes; account-synced appearance/sounds/motion; local hardware and layout |
| Updates | Manual ZIP replacement; source checks; startup diagnostics; page version; server-build refresh |
| Community recovery | Explicit setup-community.bat and original editable Skypixel Framework bundle |

This package targets the website and its persistent Node/SQLite service. Browser API support determines capture/output availability. Real throughput needs HTTPS/TURN and physical-device checks. Native applications, app stores, background call services and an SFU are outside this package. See [validation](VALIDATION.md) and [voice deployment](VOICE_DEPLOYMENT.md).

Email recovery needs a configured SMTP sender and a previously verified address. Codes need to be generated and saved before losing access. See [account recovery](ACCOUNT_RECOVERY.md).

A private host recovery tool handles independently verified owners who have lost both recovery methods. A saved but unverified address cannot reset a password. See [context menus](CONTEXT_MENUS.md) and [account recovery](ACCOUNT_RECOVERY.md).
