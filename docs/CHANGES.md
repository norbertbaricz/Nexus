# Nexus 2.35 · symmetrical confirmation actions

Reload confirmation now uses two equal-width, equal-height controls on a shared desktop row. Narrow dialogs stack both controls at the same full width. Shared action dimensions, a consistent border box and bounded grid tracks remove the half-width cancel/full-width reload layout. Three-action draft confirmations keep their full-width Save row and equal secondary pair.

This is a stylesheet correction. Application/server JavaScript, notifications, image/video behavior, data schema, dependency pins, personal setup and licensing are preserved. See [validation](VALIDATION.md).

# Nexus 2.34 · image wheel controls and automatic background video

The image viewer supports mouse-wheel zoom around the cursor and primary-button drag panning when enlarged. Wheel events are coalesced per frame, zoom/scroll stay bounded, Fit resets the view, and closing or switching images releases listeners, pointer capture and pending work. Browser page/pinch zoom, native touch scrolling, image navigation and video/audio controls retain their behavior.

Every completed video upload is automatically placed in a persistent background queue. A bounded scan also finds older video attachments. One encoder works at a time, with eight jobs in the memory window, a gap between jobs, disk/output/time budgets and bounded delayed retries. The remainder of the backlog stays in SQLite and interrupted work resumes after restart. Evicted cache entries do not cause repeated historical re-encoding. Original bytes and download rules remain unchanged.

The viewer uses ready copies quietly. The optimization button, action and preparation messages are removed. Its single-file status polling backs off in hidden tabs, cancels on close/navigation and cannot apply a late response to another clip. Schema 13 adds the job table/index; exact dependencies, startup/viewport controllers, existing account/channel logic, license and personal community setup are preserved.

FFmpeg with libx264/AAC remains required on the Node host for conversion. See [operation and limits](VIDEO_PLAYBACK.md) and [validation](VALIDATION.md).

# Nexus 2.33 · compatible video, rotation and durable navigation

Uploaded video can request a private H.264/AAC fast-start copy when the browser cannot decode its picture, playback stalls, decoded frames drop heavily or the source is large. The viewer also has Optimize video, bounded progress polling and safe cancellation when closing or changing clips. The original remains unchanged. The host needs FFmpeg with libx264/AAC; the bounded single-worker queue, private cache and failure states keep missing/unsupported encoders from preventing website startup. See [video setup and limits](VIDEO_PLAYBACK.md).

QuickTime phone uploads and additional MP4 brands now enter the video workflow by their file signatures; MP4 audio remains audio and unsupported image brands are not classified as video. Existing video files can be prepared without reuploading; old files previously classified as documents need reuploading to gain the corrected media type. The short landscape viewer gives native controls more room while keeping accessible navigation, optimization and download actions.

Live camera constraints keep their primary sensor orientation while accepting rotated dimensions. Device rotation reapplies constraints to the current camera track; decoded video resize events update its aspect and portrait layout without replacing its player, microphone or camera stream. Screen capture remains independent.

Last-channel history is now durable per account/browser instead of only per tab. A new tab or installed-site launch restores the authorized last server/channel or DM, while a tab retains its own session navigation. Restored voice/stage pages do not autojoin. The reload action removes its duplicate update toast before showing the confirmation, and modal notices account for the full stack height when choosing a free gap.

Schema 12, exact dependency pins, startup/viewport controllers, private access checks, license material and personal community setup are preserved. Physical-device rotation and real-network call delivery still require deployment checks. See [validation](VALIDATION.md).

# Nexus 2.32 · detailed alerts and call negotiation repair

System notifications now identify DM senders or the server/channel and include a bounded sender/message/attachment preview. Live and encrypted background delivery share one server-generated envelope. Online, Idle and Offline remain eligible; DND suppresses alerts. Spoiler text and spoiler attachment names stay hidden, and current session/access/block/read checks remain authoritative. Older queued envelopes still have a generic fallback.

A native-browser reproduction exposed continuous offer/answer negotiation caused by speculative answerer transceivers being stopped. Only the offerer now allocates local slots; the answerer binds the offered slots. Collision leftovers stay inactive, queued offers recheck signaling state and obsolete receiver tracks leave the stable stream. Empty audio streams wait for an actual track before player attachment. Each remote member's mute/deafen/stage/block gates remain independent of other members joining.

Speaking bars and the green ring now render above camera/screenshare pixels. Separate mute and deafen glyphs appear on participant tiles and sidebar occupants, with matching active controls. The file viewer uses decoded video dimensions and reports unsupported/audio-only video decoding clearly. H.264/AAC MP4 and VP9/Opus WebM are checked; unsupported codecs still require conversion rather than a claimed universal decoder.

Schema 12, exact dependency pins, the startup/viewport controllers, existing preview/navigation, proprietary license and personal community setup remain intact. See [validation](VALIDATION.md), [notifications](PUSH_NOTIFICATIONS.md) and [voice deployment](VOICE_DEPLOYMENT.md).

# Nexus 2.31 · stable notices and live call previews

Toasts now use the shared visible viewport and fixed footer anchors instead of searching for gaps between scrolling controls. Message and dialog scrolling cannot move them to a different gap. Notices remain overlays, stack upward within a bounded height, retain dismiss gestures and stay above the active composer/call footer. Compact editors, horizontal tab rows and phone thumbnails hide scrollbar chrome while retaining scrolling; long history/settings/lists keep their scrollbars.

The desktop green return-to-call card is back above the local profile. Phones reserve a separate footer below the composer, with a compact layout for short screens. While still connected, a muted live screenshare or camera preview follows navigation across DM/server/home views. A next-preview action cycles available sources. Publication/track ending immediately removes the preview or selects a remaining source. Presence, label and layout updates retain its player. It reuses existing authorized call tracks and never creates extra capture, room access or audio playback.

The sidebar now reconciles content and local controls separately from the call player. Leaving a full call view releases only its old video elements, preserving call-owned streams. Schema 12, exact dependencies, startup/viewport controllers, account recovery, notification delivery, the proprietary license and personal community setup remain unchanged. See [validation](VALIDATION.md) for test and device limits.

# Nexus 2.30 · picker focus, emoji search and message alerts

GIF and emoji buttons preserve the current composer/search focus. Touch opening avoids automatic search/tab focus, and selecting or closing a searched picker returns directly to the composer. Emoji search covers all 1,175 unique existing symbols with names, categories, glyphs and common aliases; cached results are bounded without a network dependency. Both pickers fit the visible keyboard viewport with independent result scrolling and 16-pixel search fields. The viewport controller also repairs root-document panning without changing inner panel scroll or pinch zoom.

Notifications sends one confirmation after explicit activation while DND is off. The separate test button is removed. Focus on Nexus no longer drops all pushes for that device; unread DM/server delivery remains eligible while browsing elsewhere. An unfocused window, voice/history or dialog no longer marks incoming messages read. Realtime all/mentions metadata covers first DMs before workspace refresh. Mobile live alerts retain worker delivery if background enrollment is unavailable. Permission/account/disable races, DND, access, blocks, read state, encrypted transport and private generic payloads remain enforced.

Schema 12, dependency pins, startup cover, call strip, responsive call controls, personal setup and proprietary license are preserved. Physical Safari/Android keyboard compositor behavior and real provider/OS delivery remain device verification steps.

# Nexus 2.29 · call navigation without overlap

The green return-to-call panel now occupies one compact row below the main navigation. It no longer floats over messages, channel lists, the composer, media or forum boards. Both mobile drawers and desktop resize handles use the same content offset, including short viewports and keyboard-driven height changes. Long room/member names truncate visually while their complete return label remains accessible. The return and disconnect actions remain separate 44-pixel controls.

The strip collapses fully on the active call screen and after disconnecting. Its content is reconciled without replacing unchanged buttons. Existing calls, participant volume, responsive media controls, startup cover, attachment focus behavior, schema 12 and dependency pins are retained.

# Nexus 2.28 · call controls and attachment focus

Focus, fullscreen and participant options now share one responsive toolbar inside each call tile. Buttons have equal geometry, remain inside narrow thumbnails and retain their accessible labels. Audio-only members keep their options; local tiles keep their existing media actions. Live tile updates reconcile toolbar labels without replacing streams. Speaking indicators sit apart from that toolbar.

Phone call layouts give the media pane its own scroll area and keep the call controls in normal layout beneath it. Short screens no longer rely on a sticky footer that can cover participant buttons. Attachment +, menu and preview actions retain an active message editor. Upload completion no longer calls focus, preventing an unnecessary keyboard reopen or stealing focus from another input/conversation. The OS file picker can still hide its own keyboard.

The accepted startup cover, dependency graph, schema 12, Web Push, account recovery and personal community setup remain unchanged. See [validation](VALIDATION.md) and [mobile behavior](MOBILE_KEYBOARD.md).

# Nexus 2.27 · stable mobile entry, composer and gestures

Initial hydration stays behind one opaque dark cover until bounded font/artwork readiness and committed layout. Returning to a tab retains the interface. The document/app use a fixed dark canvas; layout and visual keyboard heights are clamped across out-of-order events. Send keeps the active input focused and does not asynchronously reopen a phone keyboard.

The + menu now offers Gallery, Audio and Files, with explicit photo/video camera actions on touch devices. Gallery clears capture hints and supports multiple selection. DM header spacing is enlarged; the GIF action loses its permanent rectangular border while keyboard focus remains available.

Avatar/home entrance fades are removed, repeated text-channel selection avoids remounting, and same-view updates reconcile DOM nodes. Animated source swaps decode before replacement and ignore stale requests. Gesture ownership, target priority and click suppression restore swipes over drawer entries as well as text, with native vertical scrolling/pinch zoom, multitouch cancellation and a Touch Events fallback.

The dependency graph, schema 12, Web Push, account recovery, proprietary license and all personal community setup files remain intact. See [mobile behavior](MOBILE_KEYBOARD.md) and [validation](VALIDATION.md) for tested behavior and physical-device limits.

# Nexus 2.26 · background system notifications

A root service worker and authenticated Web Push sender provide optional per-device system notifications for DMs, mentions and eligible server messages. The setting requests permission only from its explicit action, reports compatibility/connection state and offers a test. Closed-page workers show the official Nexus brand with generic text and open the accessible conversation. No application/private-data fetch cache is added.

The private signing identity is generated automatically and retained in SQLite. Additive schema 12 binds subscriptions to sessions and persists a bounded, coalescing outbox. Delivery rechecks access, blocks, DND, read state and device foreground activity; expired endpoints are removed, transport failures retry briefly, logout/reset revokes sessions and late bindings cannot cross accounts. HTTPS PUBLIC_ORIGIN is required; installed iPhone/iPad copies and browser/OS permission/background policy remain necessary.

The pinned web-push 3.6.7 sender supplies payload encryption and VAPID. Multer is updated to 2.5.0 and the locked qs dependency to 6.17.0 to address published denial-of-service advisories; the final npm audit reports no known production vulnerabilities at validation time. Node 26.12.1 / Node 24 support, account recovery, existing data, the proprietary license and all personal community setup files are preserved. See [notification setup](PUSH_NOTIFICATIONS.md) and [validation](VALIDATION.md).

# Nexus 2.25 · dark keyboard transitions and aligned composer

The initial document declares a dark color scheme and opaque canvas before loading external styles. Both root and body retain the current dark palette across the full layout viewport; viewport movement no longer exposes a transparent page background. A web app manifest supplies dark installed-window/splash defaults and the official 192/512-pixel icons. Runtime browser theme color follows the active dark palette.

A dedicated viewport controller uses one geometry snapshot per animation frame instead of switching between CSS viewport units and pixels based on input focus. It retains the reduced visible height after blur until the keyboard actually closes, handles panning/orientation/page restoration and invalid intermediate reads, and avoids reflowing the page to a pinch-zoomed viewport. Workspace, dialogs, account entry, artwork and mobile/tablet drawers share the visible rectangle. Notices are repositioned after committed geometry.

Composer text and attachment/GIF/emoji/send controls share one baseline. Controls are 40 × 40 pixels with centered 20-pixel icons; the input uses a 48-pixel minimum and 24-pixel line spacing. Mobile/short-screen padding overrides that pushed the attachment icon below the message line have been removed. Multiline messages keep controls aligned to the final line. Uploads, message actions, drafts and GIF search retain their existing behavior.

The physical Android/Edge keyboard compositor is not available in the desktop QA environment; the user's video was inspected and native-device confirmation remains necessary. Tests cover the focus/geometry race and browser-rendered layout rather than claiming an actual installed-phone recording. Dependencies, schema 11, account recovery and personal community setup are preserved.

# Nexus 2.24 · branded links and lighter animated media

Shared links include a 1200 × 630 Nexus card, official logo, PNG/touch icons, title and description through server-rendered Open Graph and social metadata. The canonical origin prefers the configured public HTTPS origin; a validated direct Host fallback supports ngrok. Query strings, recovery fragments and private community/user artwork are not part of the public preview. The image revision changes when the card's bytes change.

Animations now governs GIF playback across uploaded avatar/banner/server artwork, chat/forum/gallery attachments, composer previews, the in-app viewer and provider results. Reduced-motion media uses still sources, with deliberate hover/focus/press playback. Intersection, page visibility and inert dialogs stop unnecessary animation. Loaded local images are captured through a two-job queue and a bounded in-memory still cache; no original upload bytes are rewritten. Status/reaction reconciliation preserves the active still source and crop. The reduced-motion CSS also stops repeating animation cycles and avoids full-screen backdrop blur.

GIPHY results retain the provider's exact static-rendition URL. Validated still references survive message storage and reload. Older provider messages resolve a still through the browser's documented single-GIF API; no guessed provider URLs, server proxy or canvas copies of GIPHY assets are used. Unavailable stills have a static GIF placeholder and retain interaction playback.

Client JavaScript/CSS is precompressed once at startup with Brotli/gzip, negotiated per request with encoding-specific validators and Vary. Existing build namespaces, immutable caching and identity fallback remain available. Dependencies, database schema 11, recovery behavior, proprietary license and the personal community setup are preserved.

# Nexus 2.23 · contextual actions and recovery fallback

Shared right-click menus now cover server/discovery entries, channels, categories, DMs, messages, forum posts, attachments, own presence and editable artwork. Existing member/call-tile controls also expose username copy and direct voice calling. Menus use consistent 44-pixel rows, 20-pixel icons, keyboard navigation and touch holds that cancel during scrolling. Native editor/link/media-control menus remain available. Current targets and permissions are resolved again before action dispatch; existing destructive confirmations, spoiler rules and download permissions remain enforced.

Add email stays active without SMTP. A member can save a private unverified address using the current password, with a clear delivery warning. It cannot recover the account until the host configures delivery and the member verifies the address. When delivery is available, the saved address is prefilled for verification. Entering Sign in or recovery clears stale workspace reconnection notices.

Members who lose email and recovery codes have visible recovery help. After independently establishing ownership, the VPS operator can run the private recover-account launcher or npm command to issue a 15-minute single-use reset link. The link is saved in a restricted host file, not printed in server logs; only its hash/password binding is stored in schema 11. No website user or community moderator can issue one. Issuance leaves the account unchanged. Redemption revokes old sessions, links, codes and email recovery bindings while preserving the identity/history; the member enrolls fresh methods afterward.

All existing dependency pins, the proprietary license, personal community setup and website-only deployment remain unchanged. No standalone updater or native application project is added.

# Nexus 2.22 · sign-in and secure account recovery

Sign-in accepts an optional `@`, case differences and surrounding copied username whitespace, and its input accommodates a full 24-character username plus the prefix. Password bytes and existing salted scrypt hashes are unchanged. Malformed stored hashes fail with a normal authentication rejection instead of an exception or plaintext fallback.

Forgot password supports an explicitly verified email and saved private recovery codes. Settings → Account enrolls, changes/removes an email or replaces/downloads codes after current-password confirmation. SMTP uses a configured trusted HTTPS origin, mandatory TLS/certificate validation, bounded asynchronous delivery and redacted errors. Codes work without external mail. Tokens/codes are random, stored as hashes, purpose/account bound, and protected against replay, concurrent consumption and rate abuse. Existing users must enroll a method; username knowledge alone cannot reset an account.

Password reset changes the existing account's password, preserves conversations, revokes every session immediately, clears outstanding proofs/pending email changes and invalidates the full old recovery-code set. It asks the member to sign in and save new codes. Private email/code state is never added to public profiles/bootstrap responses. The database upgrades additively to schema 10.

Member context menus now use consistent header, icon, text, divider and close-button spacing. Recovery layouts remain scrollable on small screens without automatically focusing password fields. Nodemailer 10.2.1 is pinned with its MIT-0 notice; all existing dependency pins, the proprietary license and the community setup bundle are retained.

# Nexus 2.21 · automatic device access and participant audio

Separate microphone/camera Allow buttons and their action are removed. Joining voice, starting a camera and using an input chooser request access through the existing browser flow. Passive settings enumeration does not capture. Temporary input discovery requests are deduplicated, release their tracks, preserve account boundaries and report denial without retry loops. A website cannot grant its own browser/OS permissions or suppress a screen-share chooser.

Call participants have individual 0–200% listening volume, Mute for me and Reset. Settings belong to the listener account and remote user on the current device, so display-name/socket changes do not discard them. Writes are debounced and unchanged cleanup never rewrites preferences. Independent gain graphs feed existing audio elements, keeping selected-output routing and all mute/block/moderation gates. Processed tracks are released when peers leave; original received tracks are retained.

A right-click menu works on call tiles and profile/member rows. Message right-click uses the existing message actions while preserving native selected-text/input behavior. Tile options remain accessible by button on touch devices and with Shift+F10; long presses use the existing gesture setting. Profile/message/moderation actions reuse existing flows and permission checks.

The 2.20.2 refresh glyph, manual ZIP replacement, Node 26 support, repaired dependency lock, safe client-build refresh and complete Skypixel Framework recovery bundle remain. No standalone updater, native application trial, database reset or personal community auto-import is added.
