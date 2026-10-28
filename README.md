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
5. Reload the website once. Settings → Account should show **Nexus 2.23.0**.

No separate update command or installer is required. An overlay copy can leave retired files from earlier packages on disk. If present from an older release, you can remove `update.bat`, `update.sh`, `scripts/update.js` and `test/update.test.js` once; the current website does not load or require them. Use the current ZIP as the application-file inventory and preserve your private configuration/storage when removing older application files.

The website subsequently checks for new server builds when reconnecting, returning to a tab and once per minute. It refreshes automatically when no call, modal, message send or pending upload is active. Otherwise a Reload notice lets you choose when to refresh. Active calls and unsaved work require confirmation. Pages from older releases need the first manual reload after installing this version.

A download cannot replace another machine's running process. Update the folder actually used by the VPS service or tunnel; starting another extracted copy creates a separate installation.

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
- Up to 5 GiB per file, resumable uploads, previews, clipboard images, galleries and authorized in-app media viewing.
- Blocking, timed mutes, kick/ban, voice disconnection, server/account deletion and administrative activity.
- Independent microphone/camera/screen senders, speaking indicators, mute/deafen and incoming calls.
- Per-person listening volume from 0–200%, local mute/reset, plus right-click/long-press menus for members, DMs, servers, channels, categories, messages, forum posts, attachments and editable artwork. Keyboard users can open menus with Shift+F10 and navigate their actions with arrows.
- Attached microphone/speaker/camera selectors and a screen-quality menu, plus Settings → Voice & video, local hardware choices and a speaker test.
- Camera/screen targets through 4K, 15–60 FPS and encoding ceilings through 40 Mbps; actual capture/network quality can be lower.
- Responsive layouts, resizable panels, a one-row local profile, stable settings tabs, gestures, themed dropdowns and sixteen dark palettes.

Microphone/camera permission is requested through normal call and device-selection actions, without separate Allow buttons. Opening Settings alone does not start capture. Temporary device-name discovery releases its tracks; browser/OS consent still controls access and cannot be forced by a website. Per-person volume and local mute are saved for your account on this device and apply to every connection from that user. The selected speaker, deafen, blocks and server restrictions remain authoritative for playback.

Device APIs control microphone, camera and output availability. Unsupported speaker routing is explained in the UI and uses system sound settings. General notification sounds retain their system output. Real-network calls need HTTPS and an appropriate TURN relay; see [voice deployment](docs/VOICE_DEPLOYMENT.md).

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

Private `.env`, `data/`, backups, installed dependencies, native app projects and historical databases are excluded from the ZIP. The database upgrades additively to schema 11; existing account IDs, password hashes, servers and messages are retained.

Use `npm run check` and `npm test`. See [changes](docs/CHANGES.md), [coverage](docs/FEATURE_STATUS.md), [validation](docs/VALIDATION.md), [permissions](docs/PERMISSIONS.md), [context menus](docs/CONTEXT_MENUS.md), [GIF search](docs/GIF_SEARCH.md), [security](docs/SECURITY.md) and [VPS deployment](deploy/README.md).

The original proprietary `LICENSE.txt` and required library/icon/font notices remain intact. Browser-delivered source and viewable images cannot be made uncopyable through DevTools restrictions; secrets and database access stay on the backend.
