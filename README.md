# Nexus

**Your world, connected.**

Nexus is a Node.js communication app with real accounts, communities, channels, private messages and WebRTC calls. Creating an account signs you in immediately. Ordinary accounts start with their own empty workspace. Personal community data can be imported explicitly for its owner. Communities, conversations, profiles and files are persisted by the server.

All application copy, comments and documentation are in English. Release 2.11 refines settings buttons, inline artwork editing and narrow composers, adds meaningful activity details, and separates the optional personal community import from normal application startup. See [the latest changes](docs/CHANGES_2.11.md), [personal community setup](docs/COMMUNITY_SETUP.md), [creator setup](docs/CREATOR_SETUP.md), [request coverage](docs/FEATURE_STATUS.md) and [validation](docs/VALIDATION.md).

## Run

Install **Node.js 24.15 or newer in the Node 24 release line**. Open a terminal in the extracted `Nexus` directory:

```sh
npm ci
npm start
```

Open **http://localhost:3000**. Sign in appears first; choose **Create account** if you are new. Registration signs you in immediately. On Windows, `start.bat` installs missing dependencies and starts the service.

A real multiuser service needs one running Nexus server that everyone connects to. Starting separate local copies creates separate services. For use over the internet, deploy this project on a Node.js host with persistent storage, HTTPS and WebSocket support.

## Update an existing installation

Stop Nexus, copy the updated source into the existing installation, and keep its `.env` and `data/` directory. Run `npm ci`, then `npm start`. Normal startup does not import personal server content. For the prepared personal server, stop Nexus and run setup-community.bat once; see [COMMUNITY_SETUP.md](docs/COMMUNITY_SETUP.md). Existing imports can be upgraded explicitly with the same command.

## Account-to-conversation flow

1. Sign in, or choose Create account and use a unique username, display name and password. Registration creates a secure session immediately.
2. Open **Servers** to create a server or join one with an invite. Select a server to open its channels.
3. Open **Messages → New message**, then search for a real account by username.
4. Send messages and files, reply, react, pin or search. Refreshing the browser retrieves the server's saved history.
5. Join a voice room or start a direct call. Microphone access, camera and screen sharing use actual browser media devices.

The server synchronizes appearance, sound, motion, compact mode, gestures and media layout for each account. The browser retains device-specific panel sizes, navigation, unsent drafts and pending preference changes. Messages still require a connection to the service.

## Included

- Account registration, login and logout; asynchronously hashed passwords and server-side sessions.
- Servers with owner/member permissions, custom roles, rules, invitation links and invite rotation.
- Channel editing and deletion, role-restricted private channels, read-only text channels and voice media permissions.
- Public server discovery is opt-in. Joined servers stay in the sidebar; recommendations list actual public servers on this Nexus service.
- Six channel types: text, announcements, forums, media/file galleries, voice rooms and stages, with ordered/collapsible categories and editable icons.
- Independent forum/gallery grid/list layouts, separate publishing dialogs, forum covers/post thumbnails and an in-app media viewer with zoom.
- Twenty-six server permissions with basic member defaults, role Allow/Deny/Inherit controls and protected role delegation.
- Private one-to-one conversations, HTTP and Socket.IO access checks, and authenticated file access.
- Live messages, presence, typing indicators, unread state, drafts and optional desktop notifications.
- Replies, edits, deletion, reactions, pins, search and cursor-based message history.
- Four attachments per message, up to 5 GiB each, uploaded to disk in resumable 4 MiB chunks with progress, previews and cancellation.
- Clipboard images, optional live GIPHY search, extensive emoji choices, scoped mentions, grouped messages and stable history scrolling. Pins use a button beside Search with a synchronized new-pin indicator.
- Kick, voice/stage disconnection, timed/permanent bans, temporary mutes with a live countdown, ownership transfer, server leave and administrative activity.
- Confirmed deletion of a full DM for both participants, owner-only permanent server deletion, and password-confirmed self-deletion with explicit handling for owned servers.
- An optional personal community data bundle and explicit local importer; normal startup and registration remain independent of personal content.
- Persistent account blocking across DMs, shared server text, member lists and peer media, with an unblock list.
- Eight dark interface palettes in Settings → Appearance, account badges beside display names, separate server roles, and thicker presence rings around avatars.
- Permanent usernames, editable display names, account badges, bios, pronouns, and animated GIF avatars and banners.
- Real WebRTC audio/video, screen sharing, microphone mute, deafen and incoming direct calls.
- Two main sections: Messages and Servers, direct channel navigation, compact message menus and responsive layouts. Messages open only after selecting a person from the sidebar.
- Larger profiles and settings, manually positioned artwork, bounded resizable sidebars and a persistent settings dialog that keeps drafts across tabs. Voice hides the members panel by default and remembers its own toggle preference.
- Independent camera and shared-screen streams, a large presentation stage, grid view and expanded/fullscreen viewing.
- Server icons and banners, including animated GIF uploads, editable by authorized server managers and accessible according to membership/discovery rules.
- Original local sound cues for messages, incoming calls, voice join/leave and mute controls, with volume and mute settings.
- Short view, dialog and new-message animations, smooth history/latest navigation, floating dismissible notices and optional message/navigation gestures, with an animation off switch and system reduced-motion support.

## Pictures, sounds and appearance

Settings → Appearance changes the shared UI palette while preserving dark mode. GIF search requires the hosting operator’s `GIPHY_API_KEY`; see [GIF setup](docs/GIF_SEARCH.md). Without a key the picker shows an unavailable state. The older local GIF assets remain for existing messages.

Open a server and select the server name, then **Server settings** to upload an icon or banner. Save changes to apply them. PNG, JPEG, WebP and GIF are supported, up to 5 GiB per image. Upload progress remains in the dialog. Large images and animations still need suitable device memory to decode. The server stores the actual image bytes, including GIF animation.

Open **Settings → Preferences** for **Sounds**, the volume slider, **Test sound** and **Animations**. A browser needs a click or key press before it can play audio. Do not disturb and deafen silence incoming alerts. Sound cues are created locally with Web Audio; no third-party recordings or external service are required. Palette, sound/volume, animations, compact mode, touch gestures and media Grid/List synchronize across signed-in devices. Changes queue locally while offline and retry on reconnection. Sidebar sizes, collapsed categories, member-panel visibility and operating-system notification permission remain device-specific.

## Server administration

Select a server and open its name menu. **Create channel** lives here alongside Rules, invitations, Server settings and Leave server (Delete server for owners). The channel list has no duplicate creation button. General settings contain the server images, description, rules and discovery switch. Channels lets authorized managers edit or delete channels. Permissions sets basic member defaults; Roles provides grouped Allow/Deny/Inherit overrides for 26 capabilities. Mention everyone is a separate role permission; it is denied to ordinary members by default. Authorized role managers can edit permitted lower roles and assign them to other members, with server-enforced restrictions against self-assignment, protected roles and granting powers they do not hold. Only the owner can delegate protected management powers. See [PERMISSIONS.md](docs/PERMISSIONS.md).

A channel’s gear button opens its name, topic, icon, category, type and permissions, including slowmode/attachments or voice capacity. Private channels are visible only to the owner and members with an allowed role. Read-only channels allow posting by the owner and authorized message moderators who retain send permission. Voice channels can disable camera and screen sharing; microphone, camera, screen sharing and room connection also have independent server permissions. Deleting a channel permanently removes its messages and attached files after confirmation. Owners can delete the entire server from its name menu or the General settings danger zone by typing its exact name. Account deletion is in Settings > Account; it requires the current password and username, plus explicit confirmation to delete owned servers if ownership has not been transferred.

**Rules** in the server name menu opens the server rules. Public discovery is disabled by default; enabling it publishes the server name, description, current images and rules to signed-in users and allows joining without an invitation. Recommendations come from this installation’s real public servers. Private channels and invitation codes are never included in discovery responses.

## Layout and channel behavior

Drag the divider beside the left or right panel to resize it on desktop/tablet layouts. Widths are saved on the current device. Each resizable panel stays below 45% of the viewport, with maximum widths of 420 and 480 pixels; desktop limits preserve room for the conversation. Arrow keys resize a focused divider, Shift uses a larger step, Home/End selects a bound, and double-click restores the default. Phones use fixed-width drawers instead of narrow resize controls. Voice starts with members hidden and has its own member-panel preference.

Media channels show images, video, audio and documents with Grid/List controls. Authorized members choose **Add media or files**, upload attachments and add an optional caption. Text-only posts remain unavailable in Media. Forums have their own Grid/List choice and **New post** dialog for a title/body and optional attachments. Opening a post shows its root and separate replies in the ordinary chat layout. Both layout choices synchronize with the account. See [CHANNELS.md](docs/CHANNELS.md).

Q&A and Resources are removed from creation and channel settings. Schema 8 converts existing Q&A channels to Forum and Resources channels to Media without deleting IDs, names, messages, replies, files, covers or pins. Separate channels are not merged, preserving their access rules and history. Existing channel names can be edited in Channel settings.

Click an image to view it inside Nexus, with Fit, zoom and previous/next navigation. Image Download appears only for DMs and media channels, subject to server permissions. Other text channels and forum covers do not offer it; authenticated download routes enforce the same rule for uploaded images. A recipient can still copy a displayed picture through their browser or a screenshot. This is an application download policy, not copy protection.

Avatars fill their complete rounded frame. Presence uses a continuous outline: green for online, amber for idle, red for DND and gray for offline/invisible. Accessible status names accompany the colors. Nexus account badges appear beside the display name; server roles have their own labeled section with server context. Decorative controls do not select text while dragging; messages, captions, bios, rules, usernames and editable fields remain selectable. The Nexus logo has no navigation action.

## Messages, pins and spoilers

Use **Pinned messages** beside Search in a DM or channel. A dot means a pin was added since this account last opened the list; the read state synchronizes across sessions. Select an item to load its authorized history window and scroll to it. New messages do not pull the view away while reading history. **Jump to latest** animates to the bottom, respects reduced motion and can be interrupted by scrolling.

Messages support `**bold**`, `*italic*`, `__underline__`, `~~strikethrough~~`, inline/fenced code, quotations, lists, links and `#`, `##`, `###` headings, including headings without a space. Raw HTML is displayed as text. The limit remains 8,000 characters. Normal username mentions remain scoped to the conversation; `@everyone` needs the server's Mention everyone permission and reaches only eligible channel members. `@here` mentions the other participant in a DM. Escaped mentions and code examples do not ping.

Every attachment has a **Mark as spoiler** toggle before sending, including video, audio and documents. The placeholder loads no sensitive content until revealed. Leaving and returning to the DM/channel hides it again. Spoilers are a viewing preference, not access control or copy protection.

Settings keep their title and tabs fixed while one content area scrolls. Changing tabs preserves drafts and each tab's scroll position. Opening settings focuses the dialog rather than an editable field. Notices float over the interface and prefer free gaps between controls. They do not reserve space or move the workspace. Dismiss them with the close button or a horizontal touch swipe. Touch gestures can also reply to a message with a right swipe, open its actions with a left swipe or long press, open side drawers, dismiss a sheet using its handle, and navigate unzoomed images. Vertical scrolling remains native. Settings → Preferences can disable gestures. Every gesture has a visible button alternative.

## Image positioning and member groups

Uploading an avatar, banner, server icon, forum cover or role image opens a position editor. Drag the image or use Horizontal position, Vertical position and Zoom; select **Use this position**, then save the parent settings. **Adjust avatar/banner/icon/cover** reopens the editor for an existing image. Clicking an image thumbnail in the attachment composer positions its preview. These settings are stored with the account/server/channel/role/message and propagate to authorized viewers. They do not rewrite original bytes, flatten GIFs or crop downloads. Preview shapes can vary between responsive layouts.

In Server settings → Roles, enable **Display separately in the member list** for a role. Each online member appears once under the first enabled role they hold in the saved role order. Unassigned online members use Online; all offline members share Offline. Without enabled display roles the list uses the default Online/Offline groups. The owner identity has its own display switch and order entry. Only the owner can reorder display entries. This order changes presentation and does not introduce a permission hierarchy or transfer ownership.

Channel and role icons use a visible icon grid. Other settings selectors use themed menus with keyboard selection, type-ahead and Escape. User-written rules, biographies, descriptions, messages and captions use the safe Markdown subset; usernames, display names and compact navigation labels remain plain text.

## Configure

Copy `.env.example` to `.env` to change deployment settings. Keep real environment values private.

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Listening interface; use `0.0.0.0` on your deployment host |
| `PUBLIC_ORIGIN` | Empty | External HTTPS origin; URL case, default ports and a trailing slash are normalized |
| `TRUST_PROXY` | `false` | Trust one reverse proxy; only enable behind a proxy you control |
| `SECURE_COOKIES` | `false` | Enable on an HTTPS deployment |
| `REGISTRATION_OPEN` | `true` | Allow new accounts |
| `GIPHY_API_KEY` | Empty | Optional browser web API key for live GIF search; domain-restrict with GIPHY |
| `CSRF_SECRET` | Random per process | Optional private signing secret for browser request proofs |
| `DATABASE_PATH` | `data/nexus.sqlite` | Persistent SQLite database |
| `UPLOAD_PATH` | `data/uploads` | Private uploads |
| `ICE_SERVERS` | Cloudflare STUN | JSON array of WebRTC STUN/TURN servers |
| `TURN_URLS` | Empty | Comma-separated endpoints from your actual TURN relay |
| `TURN_USERNAME` | Empty | Relay-issued username |
| `TURN_CREDENTIAL` | Empty | Relay-issued credential; keep the environment file private |
| `TURN_SHARED_SECRET` | Empty | Private coturn REST secret used to issue expiring client credentials |
| `RTC_RELAY_ONLY` | `false` | Test the configured relay without a direct path |
| `CREATOR_USER_ID` | Empty | Optional explicit existing creator account ID |
| `CREATOR_CLAIM_TOKEN` | Empty | One-time token to register the reserved creator username on a fresh database |

Registration and authenticated writes use same-origin browser metadata, canonical origin checks and signed request proofs. This supports reverse proxies that rewrite the host or scheme. Proofs are bound to the browser and current account session; the client renews a stale proof once before retrying. Cross-site requests remain blocked.

`server/config.js` contains server limits and `public/config.js` contains UI defaults. The server supplies its authoritative limits at runtime. Defaults are 8,000 characters per message, 50 messages per history page, 5 GiB per attachment, profile or server image, four attachments per message, eight voice participants and 14-day sessions.

## Voice and hosting

Run Nexus behind HTTPS for internet access. Enable `SECURE_COOKIES`, set the exact `PUBLIC_ORIGIN`, and configure `TRUST_PROXY` for your reverse proxy. Keep the whole `data/` directory on persistent storage and allow WebSocket upgrades. The default bind address only accepts local connections until you change it.

Camera and microphone APIs require HTTPS or localhost, browser permission and working devices. Screen capture support varies by browser. Configure a TURN relay for reliable connectivity across restrictive networks; STUN alone cannot establish every peer connection. Set its actual endpoints in `TURN_URLS` and its issued values in `TURN_USERNAME` and `TURN_CREDENTIAL`, or use `ICE_SERVERS` for a complete provider configuration. With coturn REST authentication, configure TURN_SHARED_SECRET instead of static client credentials. See `docs/VOICE_DEPLOYMENT.md` for the deployment checks.

Voice currently uses a mesh capped at eight participants. Large public voice rooms require an SFU and a separate scaling phase. Stored messages are not end-to-end encrypted. A passing test suite does not replace validation on your actual hosting, browsers and network paths.

## Verify

```sh
npm run check
npm test
```

The test suite runs an actual HTTP/Socket.IO server and temporary SQLite databases. It checks fresh-account isolation, registration, sessions, cookies, origin protection, proxy host rewrites, signed request proofs, community permissions, invitation replacement, DM isolation, message ownership, replies/reactions/pins, history pagination, GIF profile/server uploads, server customization permissions, database migration, custom roles, private-channel HTTP/socket isolation, live permission revocation, real opt-in discovery, protected attachments, original sound scheduling and preferences, camera/screen sender separation, early signaling, offer collisions, capture cancellation and bounded ICE recovery, voice signaling, logout and persistence through a separate application instance.

Browser QA uses isolated disposable accounts against the real service. No test accounts, messages or test databases are included in the archive. See `docs/VALIDATION.md` for the verified behavior and remaining deployment checks.

## Structure

```text
Nexus/
  server.js             HTTP startup and graceful shutdown
  server/
    config.js           Environment settings and limits
    database.js         SQLite schema and transactions
    auth.js             Passwords, sessions and cookies
    request-security.js Canonical origins and signed browser request proofs
    app.js              Authorized routes and realtime signaling
    community.js        Channel types, categories, moderation, leave and DM deletion
    permissions.js      Capability registry, defaults and role resolution
    uploads.js          Disk-backed chunk/multipart upload lifecycle
    social.js           Persistent account blocks and contact checks
    gifs.js             Provider GIF reference validation
    artwork.js          Validated image positions without rewriting originals
    preferences.js      Validated per-account settings and revision sync
    pins.js             Authorized pin counters and per-account reads
    message-content.js  Mention parsing and image-spoiler validation
  public/
    index.html          App shell
    styles.css          Original responsive visual system
    app.js              Server-backed state and interactions
    ui.js               Escaped UI rendering
    community-ui.js     Server, role and channel administration
    chat-tools.js       Upload client, emoji catalogue, grouping and mentions
    pickers.js          Bounded emoji picker and direct GIPHY requests
    appearance.js       Shared dark interface palettes
    dom.js              Keyed chrome updates that preserve live nodes
    chat-scroll.js      Follow/history/anchor and animated scrolling
    message-format.js   Bounded Markdown without raw HTML
    preferences.js      Offline partial-patch account synchronization
    notices.js          Floating notices with measured placement
    artwork.js          Manual image positioning with original GIF preservation
    role-display.js     Ordered online-role and offline member groups
    select-menus.js     Themed, keyboard-accessible select menus
    gestures.js         Touch/pen swipe handling
    layout.js           Bounded pointer/keyboard sidebar resizing
    collections.js      Media galleries and resource libraries
    image-viewer.js     In-app media viewing and authorized downloads
    media-view.js       Persistent media elements and presentation layout
    rtc.js              WebRTC media and peer lifecycle
    sounds.js           Original local sound cues and playback settings
    config.js           UI defaults
    icons.js            Local SVG primitives
    assets/             Local vector artwork, original GIF cards and bundled Inter font
  scripts/check.js      Server and browser syntax validation
  test/                 Disposable integration tests
  docs/                 Validation, architecture and branding notes
  legacy/               Original database and uploaded files
```

## Existing data and backups

Upgrading from Nexus 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 or 2.7 keeps the existing `data/` directory and `.env`. The additive schema migrations add server banners, role assignments, rules, listing preferences, categories, moderation records, upload sessions, badges, channel settings, account blocks, member permission defaults, role denials, channel covers and accepted answers. Schema 8 preserves existing accounts, messages, invitations, uploads, role overrides and pin receipts, adds image positions and ordered member display, and converts the two retired channel types. Legacy accepted-answer metadata remains stored for compatibility, without a Q&A interface. Older pins start without a false new-pin notification. Existing invitation roles retain invitation rotation during the one-time migration; later permission changes are not reset on restart.

The supplied original database and uploads are preserved under `legacy/`. They are not served to browsers. New accounts use `data/nexus.sqlite`; the legacy database is never overwritten.

The original version used browser-supplied IDs without passwords. Importing those identities as authenticated accounts requires a verified ownership mapping; otherwise someone could claim another person's profile. Original records remain intact for an explicit migration.

To back up Nexus, stop the service, copy the entire `data/` directory and your private environment settings, then restart it. Keep a separate copy of `legacy/` if you plan to import the original records later.

## Identity and licensing

The product uses its own navigation, layout, styling, local connection artwork and licensed SVG icons. It does not incorporate Discord/Telegram logos, fonts, sounds or proprietary UI assets. Functional inspiration does not constitute a legal clearance. The name `Nexus` remains subject to trademark review before a public launch. See `docs/BRANDING.md`.

The original proprietary Skypixel `LICENSE.txt` remains unchanged. The project is not relicensed as open source. Third-party dependencies retain their own licenses and are installed from `package-lock.json`. Inter 4.1 is bundled under the SIL Open Font License 1.1; no external font service is needed. Typography uses a 16 px base, readable secondary text and larger form controls, with the scale defined at the top of `public/styles.css`.

## Creator identity and security

An existing `MaxUltimat3` username is automatically bound to its account ID on the first upgraded start. On a fresh installation, set `CREATOR_CLAIM_TOKEN` privately and enter it in the creator registration field. Remove it after claiming the account. Display-name changes do not affect the badge. The creator’s publicly listed `Skypixel Framework` server sorts first with an official marker; using that name on another account does not grant official status.

See [SECURITY.md](docs/SECURITY.md) for precise storage and file-access behavior. Browser-delivered UI and visible images can be inspected or copied by their recipients. Server files and private uploads are not exposed as a static directory. Back up data before replacing code, preserve `.env` and `data/`, run `npm ci`, restart, then force-refresh browser assets.
