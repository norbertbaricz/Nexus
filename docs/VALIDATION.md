# Nexus 2.35 validation

The 56 existing interface regression tests pass on Node 26.12.1. No new tests mirror CSS declarations. Application, server and launcher JavaScript are byte-identical to 2.34, as are schema 13, exact dependency pins, startup/viewport controllers, license material and personal community setup.

Chromium checks use the production stylesheet and the exact confirmation element/class structure. At 870 × 485 the two reload controls are 245 × 46 pixels on the same row, with a 12-pixel gap. At a 390-pixel viewport both are 324 × 46, stacked with the same gap. At 320 × 320 both are 254 × 46 and the dialog has no horizontal overflow. The three-action draft confirmation retains a 502 × 46 Save button above two 245 × 46 secondary actions. These are CSS viewport checks, not physical-phone certification.

The complete ZIP verifies fingerprints, CRC, semantic lock consistency, documentation links and browser imports. Fresh launcher and 2.34-to-2.35 manual-overlay checks retain private configuration, accounts, messages, uploads and recovery state, using the existing verified dependency graph. No database reset is required. Internal layout fixtures and private storage are excluded.

## Previous release verification

# Nexus 2.34 validation

## Automated checks

Node 26.12.1 passes all 347 tests. Node 24.22.1 passes 79 focused video, interface and migration tests. Syntax checks cover 65 server/test scripts and 47 browser modules. Schema 13 adds a job table/index without changing original account, message or upload fields. Exact dependency pins, startup/viewport controllers, license material and personal setup remain unchanged.

A 200-source test uses real SQLite and an injected encoder to exercise scheduling. All 200 finish, peak encoder concurrency is one, the active/reserved memory window stays at eight or fewer and remembered jobs stay bounded at 128. This tests queue behavior, not actual throughput or CPU/RAM capacity for 200 simultaneous real-world videos. Additional cases cover backlog retention beyond the memory window, duplicate requests, bounded historical discovery, stopped-worker recovery, fixed delayed retries, global disk-pressure deferral without spending codec retries, source deletion/cancellation, and cache eviction without historical re-encoding loops. Existing authenticated status, block/membership and private byte-range cases remain active.

Client cases verify silent status observation for every video without a prepare mutation, cancellation and late-result rejection, hidden-tab backoff, unavailable-host behavior, default native timer invocation and exact-file URL validation. Image cases verify frame-coalesced wheel input, cursor anchoring, page/pinch zoom preservation, pointer capture, clamped panning, ignored secondary/touch pointers, close/navigation cleanup and Fit reset. Existing account, channel, permission, notification, media and recovery regressions remain covered.

## Real FFmpeg and browser checks

An actual HTTP multipart QuickTime/HEVC upload is converted by the real background worker without any viewer or playback-status request before readiness. ffprobe confirms H.264/AAC and a 3.018-second result; fast-start metadata precedes media bytes, the original bytes match and the authorized copy supports a 206 byte-range response. This verifies the tested source and setup, not universal codec recovery.

Chromium loads the production app and viewer with disposable local accounts and private image/video attachments. A native wheel action enlarges the image around the pointer. A real pointer drag moves its internal scroll from 451/238 to 692/117, releases capture and leaves the viewer mounted; Fit returns both axes to zero. Image navigation then opens the HEVC clip through its ready private compatibility URL, decodes 320 × 180 pixels and shows neither an optimization button nor a preparation status. The video remains contained in the 390-pixel phone viewport. No physical camera, microphone or user credentials are used.

These are Chromium CSS-viewport/input checks. Physical touch gestures, hardware decoding and camera/call behavior on actual Safari/Android devices remain deployment checks. The WebRTC call engine is not replaced by this file-conversion workflow.

## Archive and operation

The complete ZIP validates byte fingerprints, CRC, dependency-lock semantics, documentation links and browser import reachability. A fresh extraction installs dependencies offline and starts through the normal Node 26 launcher. Manual overlay from 2.33 to 2.34 preserves private environment, account IDs/passwords, messages, uploads and recovery metadata, adds schema 13 and automatically prepares an older video without a viewer request. Startup, license and personal community setup are preserved. Private configuration/storage, installed dependencies, QA fixtures/captures and transfer helpers are excluded.

Install FFmpeg with libx264/AAC on the actual Node host for automatic conversion. The queue protects resources by delaying work, so a large backlog is not converted instantly. Existing source files and native playback remain available. Copy the whole update, keep private storage/configuration, restart Nexus and reload clients.

## Previous release verification

# Nexus 2.33 validation

## Automated and real-media checks

Node 26.12.1 passes all 335 tests. Node 24.22.1 passes 121 focused interface, media-view, media-device, WebRTC, video-playback and push cases. Syntax checks cover 65 server/test scripts and 46 browser modules. Schema 12 and exact dependency pins remain unchanged.

Video cases cover queue limits, concurrent source deduplication, original preservation, bounded/truncated output rejection, cancellation/deletion races, private status/prepare routes, authenticated byte ranges, conversation membership and blocks. Client cases cover unsupported decoding, validated source switching, polling cancellation, late responses, unavailable processors/external sources and Window-style host timer binding. Upload signatures distinguish QuickTime/MP4 video, MP4 audio and unsupported image brands; the real HTTP multipart endpoint returns video/quicktime for a phone-movie signature.

A separate real FFmpeg smoke check remuxes an HEVC source into QuickTime, detects that actual signature and prepares a H.264/AAC MP4. ffprobe confirms both codecs and a 3.018-second result; its fast-start index precedes media bytes and the original bytes remain intact. This proves the tested source/workflow, not recovery of every possible codec or damaged file.

Navigation cases cover durable and tab storage, per-account keys, unavailable storage, access filtering and deleted channels. Camera cases retain microphone/camera/screen tracks through orientation constraint refresh and preserve working capture when constraints are unsupported. Notice cases remove only the reload action toast and keep a tall stack above confirmation actions when the gap below the dialog is too small. Existing notification, account recovery, permission, media negotiation and layout cases remain active.

## Browser checks

The actual app, private message attachments, production viewer controller and real host FFmpeg run together in Chromium with disposable local fixture accounts. An HEVC clip initially has no decoded picture; automatic preparation switches it to its authenticated compatibility URL and produces visible 320 × 180 frames. Playback advances. Selecting the following H.264 clip uses its original URL without a late replacement from the previous source.

At 320 × 320, the final viewer reserves a 268 × 156 stage; all five header/navigation buttons remain 44 × 44 and its footer has no overflow. At 390 × 844 the viewer retains its picture, header and native controls. At 1440 × 844 the stage is 610 pixels tall, header buttons do not overlap and the dialog has no horizontal overflow. These are CSS viewport checks in Chromium, not physical iPhone certification.

A real native canvas video track changes 320 × 180 → 180 × 320 → 320 × 180. The production binder updates its portrait class and aspect from decoded resize events. No physical camera or OS capture permission is used. The exact update notification/confirmation flow leaves the toast container empty and the Keep using Nexus / Reload Nexus actions visible. Selecting forum-qa, changing sections and returning restores that channel; a new top-level tab with empty session storage restores it from durable same-origin storage. Voice restoration does not request media capture or autojoin.

The environment does not provide a working remote ICE media path. Physical Safari/Android camera rotation, Bluetooth routing, hardware decoding, browser keyboards, real-network voice/camera/screenshare and OS push delivery therefore remain deployment checks. A local picture or stable signaling alone does not prove remote media delivery. See [voice deployment](VOICE_DEPLOYMENT.md) and [video setup](VIDEO_PLAYBACK.md).

## Archive and operation

The complete ZIP validates release fingerprints, bytes/CRC, semantic dependency-lock consistency, documentation links and browser import reachability. A fresh extracted installation passes offline npm ci and starts through the normal Node 26 launcher. Manual overlay from 2.32 to 2.33 preserves accounts/passwords, messages, private environment, uploads and recovery metadata. Original license, third-party material and personal setup are preserved byte for byte. Startup document/controller and viewport controller remain unchanged. Private storage/configuration, installed dependencies, QA captures/fixtures, transfer helpers and native application trials are excluded.

Install FFmpeg on the Node host to enable compatible video preparation; missing FFmpeg does not prevent website startup or original playback. Reload clients after copying the whole package and restarting the real service. This update does not reset the database.

## Previous release verification

# Nexus 2.32 validation

## Automated checks

Node 26.12.1 passes all 321 tests. Node 24.22.1 passes 122 focused interface, media-view, participant-audio, WebRTC, notification and encrypted push cases. Syntax checks cover 63 server/test scripts and 45 browser modules. Schema 12 and exact dependency pins remain unchanged.

Real HTTP/SQLite/Socket.IO tests verify the first-DM detailed envelope before workspace hydration, all-message server location/sender/excerpt, Online/Idle/Offline delivery and DND suppression. Web Push request generation and receiver decryption verify that details stay inside the encrypted payload. Formatter/worker cases bound untrusted text and hide spoilers, preserve account binding and avoid fetching private content in the worker. Existing membership, private-channel, read, block, session and provider retry cases remain active.

Call cases verify no speculative answerer slots, offered sender binding, early ICE plus initiating join, collision leftovers without stopping unassociated slots, stable-state checks for queued offers and obsolete receiver-track replacement. The actual media-view binder receives a delayed audio track and preserves its player; a third muted peer, independent deafen, blocks and stage gates cannot change another peer's playback. Real server signaling publishes both deafen/mute correctly and preserves existing participants when a muted third member joins. Existing capture/device-switch/rollback/recovery cases remain covered.

Viewer cases verify portrait/landscape containment, late metadata, resizing, listener cleanup, network/decode errors and the audio-only video-decoder state. Shared UI cases verify accessible mute/deafen states on camera/screen tiles and channel occupants.

## Browser checks

Chromium loads production NexusCall and media-view code with native RTCPeerConnection objects, in-page signaling and synthetic oscillator/canvas media, without hardware capture or personal accounts. Baseline 2.31 repeatedly generates offer/answer exchanges with two members. The repaired code reaches stable signaling with three active slots per pair. Simultaneous join, forced initial-offer collision, camera plus screenshare and arrival of a muted third participant remain stable. Sender audio stays enabled for the first two participants and disabled only for the muted third. Local camera/screen players reach readyState 4 with advancing frames. The environment does not produce a working ICE media path between these peers, so this is native negotiation and local playback evidence, not proof of remote RTP/audio delivery or a physical multiparty call.

Actual speaking tiles with live canvas video have video at layer 0, bars at layer 3 and the outline at layer 5. Deafen publishes separate microphone/deafen icons. A generated H.264/AAC MP4 decodes at 640 × 360 and a VP9/Opus WebM at 360 × 640; the WebM's playback reaches its end. A generated HEVC MP4 reproduces the reported audio-only/black viewer with readyState 4 and zero decoded video dimensions; the new visible diagnostic explains the unsupported video picture. The user's original clip is unavailable, so its codec/cause is not established by this reproduction.

Responsive viewer checks include 390 × 844 and 320 × 320 CSS pixels. The portrait video fits inside the phone stage, and the short-frame codec diagnostic remains inside the modal with its own bounded scroll area. No horizontal page overflow appears. These checks do not certify physical iOS/Android codecs, keyboards, OS notifications or the users' actual networks/TURN configuration. No real recipients, SMTP, provider keys or live VPS are used.

## Archive and operation

The complete ZIP validates release fingerprints, bytes/CRC, dependency-lock consistency, documentation links and browser import reachability. A fresh extracted installation passes offline npm ci and starts through the normal Node 26 launcher. Manual overlay from 2.31 to 2.32 preserves accounts/passwords, messages, private environment, uploads and recovery metadata. Original license, third-party notices and personal setup are preserved byte for byte. The startup document/controller and viewport controller remain unchanged. Private storage/configuration, installed dependencies, QA captures/fixtures, transfer helpers and native application trials are excluded. Reload every participating client after replacing the complete package; mixed old/new call clients can retain the old negotiation behavior.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.31 validation

## Automated checks

Node 26.12.1 passes all 308 tests. Node 24.22.1 passes 96 focused interface, call-preview, mobile-interaction, WebRTC and viewport cases. Syntax checks cover 61 server/test scripts and 45 browser modules, including the separate push worker. No dependency or database schema changes are introduced.

New preview cases enforce active-room membership, published/live tracks, blocked-member filtering and screen priority. They verify muted player reuse, label changes, cycling, stopped/unpublished tracks, hide/show and breakpoint reparenting without replacing sidebar or preview nodes. Clearing a player does not stop call-owned tracks. Notice cases exercise the actual footer-anchor context: message/button scrolling does not change position, stack growth retains its bottom anchor, viewport resizing clamps geometry and dialog scrolling cannot select an inner button as a new anchor.

## Browser checks

Chromium renders production UI/controllers in responsive fixtures with two real animated canvas MediaStreams. These are live local test tracks, not a remote peer or hardware capture. The preview is muted, plays inline, reaches readyState 4 and advances while navigating DM, discovery, media/forum boards and another voice room. Cycling selects the camera; presence/name updates keep its playback advancing. Returning to the actual call hides the dock and restores both main-view players. Stopping screen/camera publication removes the corresponding preview; stopping both retains only return/disconnect, and disconnecting recovers the complete footer row.

Layouts cover 320 × 320, 320 × 480, 390 × 844, 430 × 480, 768 × 480, 1024 × 844, 1440 × 480 and 1440 × 844 CSS pixels. On phones the composer ends at the call footer's top; the 390-pixel layout reserves 76 pixels with preview, 52 without it and zero after disconnect. The 320 × 320 layout uses a 60-pixel footer and bounds a long draft to 48 pixels, with no overlap or horizontal overflow. On desktop the real dock node moves into the sidebar above the profile; short windows use an inline thumbnail. Navigating or resizing does not clone its player.

A persistent notice stays at the same measured rectangle while conversation history scrolls. Stacked success/error notices stay bounded above the composer. The real disposable-account app opens its new sidebar roots, DM and Settings successfully. A 40-line draft has computed scrollbar-width none and overflow-y auto; native wheel scrolling visibly advances its lines. Appearance opens without automatic input focus, and the retained draft remains after closing Settings.

No live VPS, personal account, provider credential, microphone/camera permission, real recipients or SMTP delivery is used. Responsive Chromium frames validate layout and local media playback; physical iOS/Android keyboard compositing, Safari remote playback and real multiparty network quality remain device/deployment checks. Existing background notification prerequisites and device policies remain unchanged.

## Archive and operation

The complete ZIP validates release fingerprints, source bytes/CRC, exact dependency-lock consistency, relative documentation links and browser import reachability. A clean offline npm ci and normal Node 26 launcher run from the extracted package. Manual overlay from 2.30 to 2.31 preserves accounts/passwords, messages, environment, uploads and recovery metadata. Schema 12, exact dependencies, original license, third-party notices and personal community setup remain intact. The startup and viewport controller bytes remain unchanged; the static document intentionally gains separate sidebar/player roots. Private configuration/storage, installed dependencies, QA wrappers/streams, transfer helpers and native-app trials are excluded.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.30 validation

## Automated checks

Node 26.12.1 passes 304 tests. Node 24.22.1 passes 123 focused interface, picker, mobile, notification, push-worker, WebRTC and viewport cases. Syntax checks cover 60 server/test scripts and 44 browser modules. The final numeric root-scroll compatibility adjustment also passes the six viewport cases on both runtimes.

New cases verify local emoji search by words, aliases, glyphs and category, safe bounded output, active composer/search retention, native search focus and the actual private configured GIF opener on touch and keyboard paths. Viewport tests repair only the root scroll while retaining editor focus, inner panel scroll and pinch zoom. Notification tests verify one automatic activation confirmation, shared pending permission, denial, DND, cancellation during permission, visible confirmation failure and mobile persistent-worker fallback after background enrollment failure. The actual private markRead handler makes no read request from an unfocused window.

Real HTTP/SQLite/realtime tests deliver DM and all-message server jobs to eligible subscriptions while a receiving installation is focused elsewhere. Read/DND/block/private-access/session rules remain enforced. A first DM carries its current all-message policy over the actual Socket.IO transport before client workspace hydration. Existing tests verify real encrypted Web Push payload generation and receiver decryption using the pinned sender, without contacting a provider.

## Browser checks

Chromium first uses the real disposable-account DM with the production app. Emoji opening retains the existing textarea and draft. Searching heart returns 29 results; choosing red heart inserts the glyph at the existing cursor and returns focus to the same editor. The disabled-provider GIF view also retains the editor.

A second app run simulates touch capability and supplies local deterministic provider responses through the real searchGiphy mapper, with no real key or external provider request. Configured GIF opening retains composer focus. Querying cat and selecting Load more yields 48 result buttons while the search stays focused; selecting a result returns to the composer, retains the draft and adds one preview. These are controlled provider fixtures, not a claim of production GIPHY availability.

Both filled pickers are checked at 320 × 320, 390 × 480, 430 × 844, 768 × 480, 1024 × 844 and 1440 × 480 CSS pixels. All 12 picker rectangles and search fields remain inside the visible viewport. Search text computes to 16 pixels and results scroll independently. At 320 × 320 both picker contents occupy x=19/y=19/282 × 282, the GIF result pane is 63 pixels high and the emoji pane is 114 pixels high. The root scroll stays zero. Resizing waits for the production viewport controller's settled geometry.

Real Settings → Preferences contains one Notifications switch and no test-notifications action. At 390 × 480, the settings dialog stays within x=12/y=12/366 × 456 and its content scrolls separately. No native notification permission, real recipient, live VPS, personal account, SMTP, actual device capture or provider delivery is used for browser QA.

Physical Safari/Android keyboard compositor transitions and OS push/standby delivery are not available in this desktop Chromium environment. Reduced-height frames and simulated touch are layout/controller checks rather than physical device recordings. Background push still requires the correct stable HTTPS PUBLIC_ORIGIN and browser/device permission; iOS/iPadOS requires the supported Home Screen installation path. Device Focus/battery/background policies remain authoritative.

## Archive and operation

The complete archive validates release fingerprints, ZIP bytes/CRC, dependency-lock consistency, documentation links and browser import reachability. A clean offline npm ci and normal Node 26 launcher run from an extracted archive. Overlay from 2.29 to 2.30 preserves accounts/passwords, messages, environment, uploads and recovery metadata. Schema 12, exact dependency pins, proprietary license, third-party notices and personal community setup remain unchanged. The startup document/controller retain their previous bytes; the viewport controller is intentionally updated. Private configuration/storage, dependencies, QA wrappers/provider fixtures, transfer helpers and native-app trials are excluded.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.29 validation

## Automated checks

Node 26.12.1 passes 291 tests. Node 24.22.1 passes 84 focused interface, mobile interaction and WebRTC tests. Syntax checks cover 60 server/test scripts and 43 browser modules. The added production-helper case covers server calls while browsing text/home/another voice room, DM calls while browsing servers, correct DM labels, escaped room/member names, hiding only on the active call screen, disconnect and signed-out states.

## Browser layout checks

Real Chromium renders the production navigation, sidebar, chat, forum, media, member and call components with disposable layout fixtures. The production viewport and sidebar-resize controllers run in the fixture. No microphone/camera capture or remote media connection is requested.

Server text, DM and discovery layouts are checked at 320 × 480, 390 × 844, 430 × 320, 768 × 844, 1024 × 480 and 1440 × 844 CSS pixels. The call strip occupies y=64–116 on phones and y=72–124 on larger layouts. Content starts at its bottom rather than behind it. The composer stays within the viewport and no horizontal overflow appears. The settled 430 × 320 server composer ends at y=320, with 204 pixels reserved for the main area below the strip.

Additional checks cover media/forum boards, another voice room, the phone channel drawer, DM profile drawer, desktop members and tablet members. Visible panels and resize handles start below the strip. A 90-character room name truncates at a 160-pixel text width without pushing the arrow or disconnect action out of the strip; the full accessible label remains available. Both controls remain 44 pixels tall and the disconnect target remains 44 pixels wide at 320 pixels.

Component-fixture return actions for server and DM calls hide the strip and recover all 52 pixels. Disconnect also collapses the row without a leftover gap. A presence reconciliation leaves the draft unchanged. Existing call capture/signaling behavior is covered by the automated regression suite; these browser checks validate layout with simulated participants rather than claiming a real remote call.

The reduced-height frame validates responsive geometry, not a physical iOS/Android keyboard or its compositor. Device-specific OS transitions still need confirmation on the device. No personal account, live VPS, provider credentials or real recipients are used.

## Archive and operation

The full ZIP is checked against release fingerprints, file bytes/CRC, dependency-lock consistency, browser-module reachability and documentation links. A clean offline npm ci and the normal Node 26 launcher run from an extracted archive. Manual overlay from 2.28 to 2.29 preserves accounts/passwords, messages, environment, uploads and recovery metadata. Schema 12, exact dependency pins, startup/viewport controllers, private-data exclusions, proprietary license, third-party notices and personal community setup are preserved. The first-document startup cover is unchanged; only the call dock moves inside the workspace grid. QA fixtures and downloaded transfer helpers are excluded from the archive.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.28 validation

## Automated checks

Node 26.12.1 passes 290 tests. Node 24.22.1 passes 83 focused interface, mobile interaction and WebRTC regression tests. Syntax checks cover 60 server/test scripts and 43 browser scripts, including the separate root worker. Dependencies, schema 12 and the accepted startup document/controller remain unchanged.

New cases verify one action group for focus/fullscreen/member controls, escaped and refreshed participant labels and unchanged local/remote control ownership. Attachment actions retain focus only when the member is editing. A delayed execution of the actual private queueAttachments handler verifies that progress/completion cannot steal focus from another input or reopen the keyboard. Existing Send, picker hints, gestures, account, Web Push, permissions, uploads, media-device and signaling regressions remain active.

## Browser checks

Chromium renders the production call components with disposable participant/media layout fixtures. No microphone/camera permission or real remote call is used. At tile widths 128, 142, 160, 220 and 320 pixels, all three remote media controls stay on one row, within the card and without intersecting each other. Controls scale together on the narrowest thumbnails rather than occupying independent absolute positions. Audio-only members retain their options.

The complete call layout is checked at 390 × 844, 320 × 480, 430 × 480, 768 × 480 and 1024 × 844 CSS pixels. The media pane ends before the call footer and the footer remains inside the viewport in every case. On 320 × 480, the media pane is 165 pixels high, ends at y=348 and scrolls independently; controls occupy y=348–468, inside the 480-pixel viewport. Expanded/fallback fullscreen uses the full 390 × 844 rectangle at x=0/y=0 and returns to the original layout without replacing media elements.

A real disposable-account DM upload uses the normal Files chooser and an owned 77-byte text fixture. Opening + leaves the existing textarea focused and retains its draft. File selection, completion and sending retain the editor and clear only the sent draft. The queued attachment reaches its final size and Send becomes available. Controlled delayed-upload tests cover moving to another input while the request is pending.

Desktop Chromium cannot reproduce the physical Android/iOS keyboard, protected native picker UI or OS compositor. A native picker may temporarily hide the keyboard; this release removes Nexus-triggered blur/refocus cycles rather than claiming control over those OS transitions. No personal account, live VPS, provider credentials or real recipients are used.

## Archive and operation

The complete archive is checked for exact release fingerprints, ZIP bytes/CRC, dependency-lock consistency, import reachability and documentation links. A clean npm ci and normal Node 26 launcher run from an extracted archive. Manual overlay from 2.27 to 2.28 retains accounts/passwords, messages, .env, uploads and recovery metadata. The startup script/document/viewport controller, proprietary license, third-party notices and every personal community setup asset retain their prior bytes. Private data, dependencies, generated secrets, QA fixtures and native-app trials are excluded.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.27 validation

## Automated checks

Node 26.12.1 passes 287 tests. Node 24.22.1 passes 22 focused mobile, viewport, animated-media and first-document tests. Syntax checks cover 60 server/test scripts and 43 browser scripts, including the separate root worker. The unchanged dependency graph, schema 12, Web Push and existing account/recovery/voice/message/permission/upload tests remain in the full suite.

Mobile interaction tests run the actual event handlers against controlled document/pointer targets: reply swipes, click suppression, vertical-scroll cancellation, secondary pointers, disabled gestures, closing drawers over channel buttons, toast dismissal, downward sheet gestures, viewer navigation, long-press context menus and the older Touch Events path. Picker tests verify Gallery does not request capture, camera actions are explicit, Files clears capture and multiple selection is restored. Focus tests verify Send prevents focus transfer only from an active editor. Existing context-menu and gesture regressions remain active with their browser fixtures updated for AbortController and Pointer Events.

Viewport tests cover both resize orders during keyboard transitions, invalid reads, panning, pinch zoom, focus/blur and page restoration. Source-swap tests hold the previous image until decode, reject reversed/removed requests and preserve account invalidation. First-load tests verify font/layout readiness, single dismissal and a bounded slow-image path. HTTP tests verify early dark markup, the resizes-content hint, startup cover and installed-site metadata.

## Browser checks

Real Chromium QA uses disposable accounts and the real DM composer. At 390 CSS pixels, the DM avatar is 36 pixels wide and the avatar/name layout gap measures 12 pixels. The GIF action has no permanent border. The + action opens the Nexus Gallery/Audio/Files menu. Explicit camera rows are covered by touch-capability component tests; the desktop QA browser has no physical camera picker.

A real DM send keeps the original textarea focused while clearing its value after the response. At 320 × 480, the settled workspace height is 480 pixels, the composer bottom is 450 pixels and all four controls measure 40 × 40 with a common center line. The document has no horizontal overflow, and the canvas remains rgb(16,16,20). Initial navigation shows the opaque startup cover before the interface is revealed. Browser inspection also checks normal and desktop-width layouts.

The reduced-height iframe tests viewport layout, not an actual Android/iOS keyboard compositor. Physical standby, native gallery/camera pickers, OS-reserved edge navigation and installed Edge/iOS keyboard transitions require device checks. Touch sequences are automated handler tests rather than a physical touch recording. No live VPS, personal credentials, real recipients or SMTP/push-provider deliveries are used.

## Archive and upgrade

The complete ZIP is checked for CRCs, release/source fingerprints, exact dependency pins, documentation links and reachable browser imports. A clean npm ci and normal Node 26 launcher run from an extracted archive. A manual overlay from 2.26 to 2.27 preserves .env, accounts/passwords, messages, uploads and recovery metadata. Schema 12 is retained without a new migration. Original license, third-party notices and every personal Skypixel Framework setup file retain their bytes. Private storage, installed dependencies, QA fixtures, generated secrets and native-app trials are excluded.

## Previous release verification

The following records describe earlier releases and remain regression context.

# Nexus 2.26 validation

## Automated checks

Node 26.12.1 passes 277 tests. Node 24.22.1 passes 29 focused push, worker, client, asset and database migration tests. Syntax checks cover 59 server/test scripts and 41 browser scripts, including the separately scoped service worker. Existing account, recovery, message, upload, moderation, media, voice, keyboard and asset regressions remain in the full suite.

New coverage uses actual authenticated HTTP routes, SQLite and live sockets with a synthetic push transport. A real web-push 3.6.7 encryption result is decrypted with receiver keys to verify payload compatibility and absence of message text. Cases cover endpoint/key validation, CSRF/authentication, account rebind, logout cascade, read/DND/block/foreground suppression, mention defaults, private-channel revocation, coalescing, retries, expired endpoints, session expiry and persistence across schema-11 migration/restart.

The actual worker script runs in a controlled worker/IndexedDB fixture: generic branding without an open page, account/quiet/permission/age checks, guarded unbind, safe click routing and an account change during background subscription renewal. Client checks cover explicit gesture-time permission, unsupported/insecure environments, enrollment races, DND and duplicate-live suppression. Worker HTTP tests verify a direct root URL, update headers, build isolation and absence of redirects. This is automated transport/protocol coverage, not a report of delivery by Apple/Google/Mozilla on a physical device.

Production dependencies are pinned. npm audit reports zero known production vulnerabilities on 2026-10-28 after updating Multer to 2.5.0 and qs to 6.17.0. That result is time-specific and does not replace a security audit.

## Browser checks

A disposable local account loads the real application in Chromium. Notification settings are readable at 320, 390 and 1024 CSS-pixel widths. The document width equals its viewport with no horizontal overflow at 320 and 1024 pixels; controls remain inside the settings page. The HTTP preview correctly explains that HTTPS is required and does not request permission automatically. A conversation deep link opens the intended DM without starting a call.

The managed preview is HTTP and cannot exercise secure-context PushManager enrollment. Physical iPhone/iPad/Android standby delivery, browser background policies, OS notification permission/Focus/battery restrictions and real push-provider delivery remain deployment/device checks. No real VPS, personal SMTP credentials or live provider subscriptions are used. Browser-extension errors are separate from application code.

## Archive and operation

A fresh npm ci and normal Node 26 launcher are checked from the extracted archive. A manual overlay from 2.25 to 2.26 retains .env, accounts/passwords, messages, uploads and existing recovery metadata while upgrading SQLite from schema 11 to 12. Release fingerprints, exact dependency pins, reachable browser imports, separately scoped worker, documentation links and ZIP CRC/bytes are verified. Every personal community setup file and the original proprietary license retain their original bytes. Private storage/configuration, installed dependencies, generated recovery links, QA fixtures and native-app trials are excluded.

## Previous release verification

The following records describe prior releases and remain regression context.

# Nexus 2.25 validation

## Current automated checks

Node 26.12.1 passes 259 tests. Node 24.22.1 passes 9 focused viewport/mobile/provider/appearance tests. Syntax checks cover 55 server/test scripts and 38 browser modules. Existing account, messaging, permission, recovery, upload, call and asset-cache regressions remain included in the full suite.

New tests exercise the keyboard closing sequence after blur, successive visual heights, panning, layout-resizing browsers, pinch zoom, invalid/zero geometry, page restoration/orientation, event coalescing, unchanged-write suppression and disposal. HTTP checks verify the early dark canvas before external CSS, dark color-scheme/viewport metadata, public manifest MIME type, installed-site identity/colors and actual 192/512-pixel PNG bytes.

## Current browser checks

The supplied 40-second phone recording was inspected around the exposed white region. Real Chromium QA uses a disposable local account and an actual DM composer. Measured widths 320, 390, 430, 768 and 1024 CSS pixels have no horizontal document overflow. Attachment/GIF/emoji/send controls are all 40 × 40 pixels, SVG centers match their control centers and each control center matches the single text-line center with a measured difference of zero pixels.

A two-line input grows to 72 pixels. At a 390 × 480 reduced-height viewport all control centers match the final text line with a zero-pixel difference; the composer stays inside the viewport after the animation-frame geometry commit. Restoring height to 844 restores the application height to 844. HTML/body backgrounds remain opaque rgb(16,16,20) in the active palette. The server text composer shares the same geometry.

The resized iframe is a controlled layout test, not a native keyboard emulator. No physical Android/iOS device or installed Edge compositor is available in this environment. The changes address website canvas/geometry and installed-site metadata; an actual-device recording is required to certify disappearance of the native flash on the user's exact browser/OS build. The test environment does not use real credentials, SMTP or the live VPS.

## Archive and operation

The package retains schema 11, dependency pins, the proprietary license and every personal community setup file. Release fingerprints, browser-import reachability, documentation links and ZIP bytes/CRC are checked. Private configuration/data/uploads, generated recovery links, installed dependencies, QA scripts and recordings are excluded. The manual overlay check from 2.24 to 2.25 preserves .env, existing accounts/passwords, messages, uploads and recovery metadata while the normal launcher serves the new build.

## Previous release verification

The following records document earlier release checks and remain regression context.

# Nexus 2.24 validation

## Automated checks

- Node.js 26.12.1: 254 tests pass, including real HTTP, SQLite and live-socket regression cases.
- Node.js 24.22.1: 19 focused motion, provider, metadata, transfer and asset-cache tests pass.
- Syntax: 53 server/test scripts and 37 browser modules.
- Motion policy: explicit hover/focus/press playback; OS reduced motion; background/offscreen gates; bounded poster count/bytes and two-job concurrency; source deduplication; late-result and account-reset races; unchanged crop/new-source handling; immediate static fallback while legacy GIPHY metadata resolves.
- Provider flow: exact API still URLs, query-string preservation, matching provider ID/host/type validation, rejection of arbitrary/mismatched still references, and persistence through actual message storage/reload.
- Preview: complete metadata in unauthenticated HTML without JavaScript; trusted-origin priority; validated ngrok Host fallback; forwarded-host/query/proof exclusion; publicly reachable PNG signatures, dimensions and size.
- Transfer: Brotli/gzip/identity negotiation, weighted/disabled encodings, decoded byte equality, distinct representation validators, conditional requests and Vary. The current JavaScript/CSS totals are about 620 kB uncompressed and 175 kB with Brotli quality 4 (about 72% less transferred source); this is not a frame-rate benchmark or total page-weight claim.

## Browser checks

Real Chromium QA uses only disposable local accounts/data. Switching Animations off produces actual data-image still sources for uploaded GIFs, including profile avatars, banners, server artwork and message media. Deliberate profile interaction restores the original source; leaving the status menu restores the cached still after a live presence change. Message reaction updates retain paused sources; the in-app viewer opens normally. Images behind inert dialogs pause as well.

At a 390 × 844 CSS viewport, mobile profile settings retain their layout, the document's width equals its 390-pixel viewport without horizontal overflow, avatar/banner stills are visible and the focused control remains a button rather than opening an input keyboard. The same account's animation preference syncs to another open session. Physical iOS/Android touch hardware, actual provider credentials, external SMTP delivery and a live ngrok/VPS connection are not tested. Browser-extension errors are distinguished from application errors.

## Packaged update

The archive preserves dependency pins, schema 11, original license and every personal Skypixel Framework setup asset/rule/post. All browser imports are reachable and documentation links resolve. ZIP CRCs, source bytes and release fingerprints are checked. Private environments, databases, uploads, generated recovery secrets, installed dependencies, QA files, native trials and standalone updaters are excluded.

A freshly extracted archive starts through its normal launcher on Node 26.12.1. A real manual overlay from 2.23 preserves the existing .env, uploads, account/password and stored messages/recovery metadata; the new launcher serves the expected 2.24 build and reports database readiness. Existing @username login and recovery codes remain usable. See the deployment guide for tunnel/provider-dependent behavior.

## Previous release verification

The following account/context regression history was completed for 2.23 and remains covered by the current full suite.

# Nexus 2.23 validation

## Automated verification

The complete suite passes 243 tests on Node 26.12.1. Syntax checks cover 50 server/test scripts and 36 browser modules. All production dependency pins and locked dependency entries are unchanged from 2.22.0. The 36 focused authentication/recovery, mail and migration cases also pass on Node 24.22.1.

New cases cover private unverified email saving without SMTP; inability to recover through an unverified address; host issuance preconditions and unsafe output paths; restricted private files and hashed proofs; unchanged accounts before redemption; expired, rotated, revoked, password-stale and replayed host proofs; concurrent single consumption; clearing old recovery bindings; rollback after a handoff-file write failure; and the absence of a website issuance endpoint. A verified email or authenticated recovery-method change invalidates an outstanding host link. Schema-ten account-security records, token/code hashes and password hashes survive the additive schema-11 migration.

Context cases cover owner/member/discovery permission differences; clicked channel/DM/category targets; category order/collapse behavior; spoilers and existing download restrictions; forum/self/artwork actions; native editor/link/media boundaries; and touch-hold cancellation/click suppression. Existing voice, audio, device, message, upload, moderation, preference, presence, block, community and startup regressions remain included.

All identities, passwords, email addresses, reset links and private files used for verification are disposable fixtures. SMTP tests use an injected local transport and send no real email.

## Actual browser checks

Chromium opens a DM context menu while no conversation is selected. Selecting Open conversation navigates to the clicked DM. Right-clicking the secondary server and choosing Server settings opens its actual saved name; a different channel's settings likewise show that channel's name. A forum post exposes its menu and successfully opens the emoji reaction picker. A Media attachment exposes permitted Open/Download actions, and Open uses the existing in-app viewer. Right-clicking the actual editable avatar surface opens Upload/Adjust/Remove; Adjust opens the image-position editor.

Arrow keys move between menu actions; End reaches the final action; Escape restores focus to the original item. Measured action rows are 44 pixels high with 20-pixel icons and identical label origins. At a 390 × 844 CSS viewport the menu remains within the frame, with no horizontal overflow. Account recovery retains an enabled Add email button without SMTP, opens Save email, and has fields/actions within the viewport without automatically focusing an input. The I cannot access either method path opens recovery help with no password fields and no horizontal overflow.

Browser QA inspects credential forms without entering passwords, creating credentials or submitting recovery changes through browser automation. API fixtures cover actual save, verification, reset and sign-in behavior. Touch holds are verified through controlled pointer/timer cases; no physical iOS/Android device, touch hardware or external VPS was tested.

## Archive and operation

The ZIP checks current fingerprints, reachable browser imports, relative documentation links, unchanged dependency pins, ZIP integrity, the original proprietary license and every original community setup asset/rule/post. Private configuration/storage, generated recovery handoff files, installed dependencies, QA fixtures, native trials and standalone updaters are excluded.

A fresh extracted installation passes npm ci and starts through its normal launcher on Node 26.12.1. A manual overlay onto an extracted 2.22 installation preserves its private environment, existing salted password hash, account/message/upload records and enrolled recovery metadata; the updated launcher serves 2.23 assets and reports database readiness at schema 11. Existing @username sign-in and legacy recovery codes remain usable. The packaged host utility is exercised in a private interactive test terminal; its secret is written only to the restricted fixture file and is not included in the deliverable.

The host-assisted flow depends on independently verifying ownership. The tool records operator attestation; it cannot establish a human's identity itself. Private plaintext link files require careful handoff, deletion and platform-appropriate host permissions. Windows batch execution and real SMTP provider delivery remain deployment checks. No guarantee of universal account recovery or independent security certification is made.
