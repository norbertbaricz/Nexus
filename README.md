# Nexus

A website for communities, direct messages and WebRTC calls, with one persistent Node.js backend. This archive contains the website and its server; application trials and their build files are excluded.

## Start

Use Node.js 26.x (tested with 26.12.1) or Node.js 24.15+ in the Node 24 release line. Extract the complete ZIP.

- Windows: run `start.bat`.
- Linux/macOS: run `bash start.sh`.

The launcher prints the selected Node executable, verifies release files, installs missing/mismatched dependencies and starts Nexus. Open http://localhost:3000 by default. Copy `.env.example` to `.env` for your own deployment settings. Sign in appears first; registration signs you in immediately.

Startup prints the website version, exact installation folder, client build and storage paths. Settings → Account shows the loaded page version. If the port is occupied, stop the old Nexus terminal/service before starting the update. Copying files or refreshing a browser does not restart a Node process.

For development, use `npm ci` then `npm run dev` to edit source without release fingerprint enforcement. Production `npm start` verifies the packaged executable source.

Node 26.12.1 is supported. This release also repairs a previous Multer lock-entry mismatch that could prevent a clean `npm ci` installation. If `package-lock.json` was only reformatted or its line endings/key order changed, production startup still accepts the same JSON content. Actual dependency changes, invalid/missing lock files and mixed executable source remain rejected. Repair those by copying the affected application files from the same complete ZIP; include `release.json` when replacing the application. Keep `.env` and persistent storage. Do not remove `release.json` or regenerate its fingerprints. Runtime errors identify the detected version/path, while release errors identify the affected files.

## Update an existing installation

1. Stop the existing Nexus terminal or VPS service. Back up your `.env`, database, uploads and any personal `setup/` edits.
2. Extract the ZIP and copy the **contents of its Nexus folder** over your existing installation, replacing the application files. Copy `package.json`, `package-lock.json` and `release.json` together with the complete `public/`, `server/` and `scripts/` folders.
3. Keep your existing `.env`, `data/` and any externally configured storage. The ZIP does not contain or reset these private files. Retain your personal `setup/` files if you have customized them.
4. Start that same installation with `start.bat` or `bash start.sh`, or restart its service. The launcher installs missing/mismatched dependencies when needed.
5. Reload the website once. Settings → Account should show **Nexus 2.38.0**.

No separate update command or installer is required. An overlay copy can leave retired files from earlier packages on disk. If present from an older release, you can remove `update.bat`, `update.sh`, `scripts/update.js` and `test/update.test.js` once; the current website does not load or require them. Use the current ZIP as the application-file inventory and preserve your private configuration/storage when removing older application files.

The website subsequently checks for new server builds when reconnecting, returning to a tab and once per minute. It refreshes automatically when no call, modal, message send or pending upload is active. Otherwise a Reload notice lets you choose when to refresh. Active calls and unsaved work require confirmation. Pages from older releases need the first manual reload after installing this version.

A download cannot replace another machine's running process. Update the folder actually used by the VPS service or tunnel; starting another extracted copy creates a separate installation.

## Mobile keyboard and installed website

The page starts behind one opaque dark cover while its first interface, font and essential artwork settle. Returning to a tab keeps the current interface mounted. A fixed dark document canvas and shared viewport controller handle keyboard sizing, including out-of-order visual/layout resize events. Sending from the active composer retains focus instead of closing and reopening the keyboard. Phone DM headers have a clear avatar/name gap; the GIF action has no permanent border. The + menu offers Gallery, Files and Audio, plus explicit camera actions on touch devices. See [mobile interaction and keyboard behavior](docs/MOBILE_KEYBOARD.md).

Call tiles keep focus, fullscreen and member options in one responsive action row. On phones, the media pane scrolls separately from the call controls, including short landscape layouts. Attachment menus and preview actions preserve an active editor; completed uploads never force keyboard focus. The first-load screen is retained.

Existing Edge installations can retain old installation metadata. After copying the full update and restarting Nexus, close and reopen the installed website. If the installed copy still uses its previous background/icon metadata, remove that installed shortcut and install it again from the updated website. Removing the shortcut is not a Nexus account-deletion action; this update does not require removing the account or server data.

## Background notifications

Nexus 2.26 adds standards-based Web Push for DMs, mentions and eligible server messages. Notifications can arrive while the page is closed or the device is locked, subject to browser/OS support and permissions. Set `PUBLIC_ORIGIN` to the stable public HTTPS origin and restart Nexus, then enable **Settings → Preferences → Notifications** on each device. Activation automatically requests one confirmation notification while Do not disturb is off. There is no separate test button. The private signing identity is generated automatically in the database; no Apple developer, Firebase project or copied VAPID key is required.

On iPhone/iPad, use a supported OS/browser to add Nexus to Home Screen, open that installed copy and enable notifications from its settings. On supported Android and desktop browsers, grant website notifications and allow the browser/app to run in the background. Installation alone does not grant permission. Focus, battery restrictions, force-stop and browser shutdown policies can prevent or delay delivery.

Alerts use the official Nexus logo and identify the sender, DM or server/channel, with a bounded message or attachment preview. Spoiler contents remain hidden; the operating system controls lock-screen presentation. Clicking opens the authorized conversation. DND, blocks, access, read state and a focused device are checked before sending. Signing out or resetting the password revokes that session's background subscriptions. See [push setup and limits](docs/PUSH_NOTIFICATIONS.md).

## Link previews and lighter motion

Shared links now include the official Nexus logo, a 1200 × 630 card and server-rendered Open Graph/social metadata. Keep `PUBLIC_ORIGIN` set to the current public HTTPS origin, including the current ngrok address when tunneling. Without it, preview metadata uses a validated direct Host header; forwarded hosts, invitation parameters and recovery fragments are never published in the card.

Settings → Preferences → Animations now controls animated images as well as interface transitions. When off, GIFs display still frames and play during hover, keyboard focus or press. Offscreen/background media and content behind dialogs pause too. The operating system's reduced-motion preference is respected. JavaScript/CSS transfer supports Brotli and gzip without new dependencies. See [performance and link previews](docs/PERFORMANCE_AND_LINKS.md) for operation and limits.

## Video playback and navigation

For automatic compatible video copies, install FFmpeg with H.264/AAC encoders on the VPS/Node host. Set `FFMPEG_PATH` only when its executable is not on the service PATH, then restart Nexus. Every completed video upload enters a persistent background queue automatically. Existing videos are discovered in small batches. One encoder works at a time; the viewer has no optimization button or preparation notice and uses the private fast-start MP4 when ready. Original files remain unchanged. See [video setup and budgets](docs/VIDEO_PLAYBACK.md).

In the image viewer, use the mouse wheel to zoom around the cursor and drag an enlarged image with the primary mouse button. Fit restores the centered view; native touch scrolling/pinch and media navigation remain available. The video viewer retains native playback controls in short landscape screens. Live camera dimensions update when capture rotates, without reopening devices. Last server channels, DM and section are retained separately for each account in the browser, including a new tab or installed-site launch on the same origin. Restoring a voice/stage page never automatically joins its call. This history is local to each browser/device and does not transfer to a different origin or account.

## Sign-in and account recovery

Sign in with the permanent username, with or without `@`; capitalization and surrounding copied whitespace are handled. Display names are not login identifiers. Passwords remain case-sensitive and are never trimmed or Unicode-normalized. Existing password hashes are retained.

**Forgot password?** supports a previously verified recovery email or a saved private recovery code. While signed in, open **Settings → Account → Account recovery** and add/verify an email, generate/download recovery codes, or both. Adding, removing or replacing recovery methods requires the current password. Recovery codes work without SMTP. Add email remains usable when delivery is disabled: it saves a private unverified address and clearly explains that verification is still required. Once delivery is enabled, choose Verify email and confirm it from the inbox.

For email delivery, configure `PUBLIC_ORIGIN` and the `MAIL_*` values in your private `.env`, then restart Nexus. Use your provider's SMTP credentials and approved sender. See [account recovery setup](docs/ACCOUNT_RECOVERY.md) for exact steps. The ZIP contains no provider credentials and does not send mail until configured.

Existing accounts do not gain a verified email or recovery codes automatically. If a member loses both methods, Forgot password → I cannot access either method explains host-assisted recovery. The operator of the VPS must independently verify ownership, then run `recover-account.bat`, `bash recover-account.sh` or `npm run recover:account` in the private host terminal. The tool issues a private 15-minute single-use link; it does not immediately change the account. It is unavailable to website users and community moderators. Knowing a username alone is insufficient. See the recovery guide for identity checks and private-file handling; never reset the database to recover an account.

## Functionality

- Real accounts, permanent usernames, editable profiles, positioned avatar/banner uploads, presence rings and badges.
- Private verified recovery email, downloadable recovery codes and single-use password resets that revoke existing sessions.
- DMs, public server discovery, roles/permissions, categories and text, announcement, forum, media, voice and stage channels.
- Markdown, mentions, replies, grouping, typing names, unread markers, search, reactions, persistent pins and spoilers.
- Optional per-device system notifications with background Web Push, branded alerts and conversation links.
- Up to 5 GiB per file, resumable uploads, previews, clipboard images, galleries and authorized in-app media viewing.
- Blocking, timed mutes, kick/ban, voice disconnection, server/account deletion and administrative activity.
- Independent microphone/camera/screen senders, speaking indicators, mute/deafen and incoming calls.
- Per-person listening volume from 0–200%, local mute/reset, plus right-click/long-press menus for members, DMs, servers, channels, categories, messages, forum posts, attachments and editable artwork. Keyboard users can open menus with Shift+F10 and navigate their actions with arrows.
- Attached microphone/speaker/camera selectors and a screen-quality menu, plus Settings → Voice & video, local hardware choices and a speaker test.
- Camera/screen targets through 4K, 15–60 FPS and encoding ceilings through 40 Mbps; actual capture/network quality can be lower.
- Responsive layouts, resizable panels, a one-row local profile, stable settings tabs, gestures, themed dropdowns and sixteen dark palettes.

Microphone/camera permission is requested through normal call and device-selection actions, without separate Allow buttons. Opening Settings alone does not start capture. Temporary device-name discovery releases its tracks; browser/OS consent still controls access and cannot be forced by a website. Per-person volume and local mute are saved for your account on this device and apply to every connection from that user. The selected speaker, deafen, blocks and server restrictions remain authoritative for playback.

Device APIs control microphone, camera and output availability. Unsupported speaker routing is explained in the UI and uses system sound settings. General notification sounds retain their system output. Real-network calls need HTTPS and an appropriate TURN relay; see [voice deployment](docs/VOICE_DEPLOYMENT.md).

## Participant volume and call cards

Volume reductions use the existing received stream and player when the browser supports native element volume. Devices with fixed element volume use an independent gain path; amplification above 100% also uses that path. A private muted raw-stream player keeps the WebRTC receive path active while processed audio plays through the selected speaker. Amplification waits for this input to play; interrupted processing or a refused processed output falls back to native 100% playback with an explanation, while preserving the requested boost for a later user-action retry. Fixed-volume reductions stay silent until their exact lower volume can be applied. Reset restores 100%, clears only that person's local mute and returns playback to the original received stream immediately, including when a processing context is interrupted. The slider thumb, percentage and accessibility value update together. It does not override deafen, blocks, moderation or the selected output.

Each participant has one stable call card. Screen sharing replaces its main camera/avatar view; a simultaneously enabled camera appears inside that same card. Grid, focus and fullscreen retain the participant card and existing main video element. Camera/screen capture and network tracks remain independent.

## Voice state synchronization

Live room updates are retained if an older workspace request completes later. The join acknowledgement supplies the current authorized participant list before initial peer offers, and completed workspace refreshes reconcile existing audio immediately. Empty rooms, mute/deafen, blocks and stage restrictions remain authoritative; account-specific volume/input choices are not reset. After updating the server, every participant should leave the call, reload Nexus to 2.38.0 and join again so old running clients do not retain the previous synchronization code. See [voice deployment and verification](docs/VOICE_DEPLOYMENT.md).

## Skypixel Framework recovery

**setup-community.bat**, its importer and the complete editable `setup/` bundle remain included. Run the script against your real installation while Nexus is stopped. It imports the prepared personal server for the verified creator account, including artwork, rules, roles and channels. Normal startup never automatically imports personal content.

See [community setup](docs/COMMUNITY_SETUP.md) and [creator identity](docs/CREATOR_SETUP.md). No account database, password or claim token is shipped.

## Files and verification

| Path | Purpose |
| --- | --- |
| `public/` | Website modules, styles, font, icons and local GIFs |
| `server/`, `server.js` | API, database, permissions, storage and signaling |
| `scripts/` | Release checks, runtime diagnostics, host-only account recovery and community importer |
| `recover-account.bat`, `recover-account.sh` | Host-assisted recovery after independently verifying ownership |
| `setup/`, `setup-community.bat` | Personal community recovery |
| `deploy/` | HTTPS proxy and systemd examples |
| `test/` | Disposable product regression tests |
| `docs/` | Current setup, feature, security and validation guides |
| `release.json` | Fingerprints for a consistent release |
| `licenses/`, `LICENSE.txt` | Required license material |

Private `.env`, `data/`, backups, installed dependencies, native app projects and historical databases are excluded from the ZIP. The database upgrades additively to schema 13; existing account IDs, password hashes, servers and messages are retained.

Use `npm run check` and `npm test`. See [changes](docs/CHANGES.md), [coverage](docs/FEATURE_STATUS.md), [validation](docs/VALIDATION.md), [permissions](docs/PERMISSIONS.md), [context menus](docs/CONTEXT_MENUS.md), [GIF search](docs/GIF_SEARCH.md), [security](docs/SECURITY.md) and [VPS deployment](deploy/README.md).

The original proprietary `LICENSE.txt` and required library/icon/font notices remain intact. Browser-delivered source and viewable images cannot be made uncopyable through DevTools restrictions; secrets and database access stay on the backend.
