# Nexus 2.11 validation record

Date: 2026-10-26

## Current 2.11 checks

- All **113 automated tests pass**, with no skips or failures. Syntax checks cover 32 server/test scripts and 26 browser modules.
- HTTP/Socket.IO integration checks verify meaningful activity metadata for server and channel edits, deleted channel names, layout changes, access changes and actor identity. Entries render readable action labels and escaped before/after values. Older entries receive readable labels without invented historical detail.
- Schema 9 adds audit metadata while retaining existing accounts, messages, files and audit entries. The retained migration and foreign-key checks pass.
- Explicit community-import tests cover a fresh import, repeat-import idempotency, creator ownership and the revision-two upgrade. Best Tester assignments transfer to Tester, the retired role is removed, custom rules remain and private-channel access is not broadened to all Testers. Ordinary startup and registration no longer install personal community data.
- Component checks verify that editing controls appear only on editable profile/server artwork previews. Public profiles and discovery cards remain read-only. Destructive actions share their respective action rows; outside danger zones, redundant subtitles and visible sync-status copy are absent.
- Actual browser: account and server settings use distinct rounded tab buttons without a long underline. Server settings omit the repeated server-name subtitle. Profile/sounds and account-sync status copy are absent; underlying preference synchronization is retained.
- Actual browser: changing a disposable server description and saving produced a readable Server settings updated entry, the actor name and the exact old/new description. No raw dotted action code was shown.
- Actual browser: profile/server artwork menus offered Upload, Adjust position and Remove directly on the corresponding preview. Server banner adjustment opened the existing crop editor and returned successfully. Removing a profile picture changed only the draft; discarding restored the saved profile. Touch layouts expose the edit controls without requiring hover.
- Actual browser: Delete account sits beside Sign out and opens the existing password/username and owned-server warning dialog. Cancelling preserves the account. Destructive backend results remain covered by the isolated deletion tests retained below.
- At all eight tested sizes, Delete server, Cancel and Save changes shared one row with 44-pixel-high controls, all inside the action row with their content fitting. Sign out and Delete account likewise stayed on one row with 44-pixel controls and fitting labels. Narrow phones use the named trash icon for Delete server.
- At 320 pixels wide, the main composer settled on the single-line Message placeholder with equal 50-pixel client/scroll heights. Its accessible label retained the recipient. At 1366 pixels wide, the full recipient placeholder returned; a ResizeObserver updates it when the actual input width changes. Message text still wraps normally.
- Profile edit controls measured 40 pixels on the phone layout, and the page had no horizontal overflow. Browser QA used disposable fixture accounts and data, which are excluded from the archive.

Test viewports: 320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080. These are Chromium browser geometry checks, not physical iPhone/OS-keyboard certification. No new remote audio/video delivery claim is made; the native media/relay limitations recorded for 2.9 below still apply. The personal community import must run on the user's own installation; producing this archive does not modify another running database.

## Retained 2.10 checks

- All **109 automated tests pass**, with no skips or failures. Syntax checks cover 30 server/test scripts and 25 browser modules.
- HTTP/Socket.IO integration tests verify owner-only server deletion, exact-name confirmation, live voice removal, channel/history/pin cleanup, invitation invalidation, upload-session cleanup and removal of disk bytes.
- Account deletion tests verify password/username confirmation, the owned-server consent requirement, profile/messages/files/DM/session cleanup, preservation of another server and another author's message, reply-reference cleanup, cache invalidation and creator-identity removal. SQLite foreign-key checks remain clear.
- Moderation tests cover the independent disconnect permission, ordinary-member denial, voice and stage removal, timeout rejoin rejection, expiry metadata and timed/permanent ban reasons. Owner/protected-moderator restrictions are retained.
- Setup tests verify first import, all six channel types, original artwork bytes, repeat-start idempotency, retention of later edits, adoption of an existing creator server, opt-out from initial content replacement, a fresh database and legacy single-official binding with automatic setup disabled. Deleting the official community does not recreate it or grant the badge to a duplicate on restart.
- Actual browser: the empty title and Markdown welcome copy share the center of the history area; an empty conversation has no Jump to latest indicator. The discovery view has one Create server action and its sidebar has one Join action.
- Actual browser: unsaved changes open a separate confirmation over Settings. Keep editing retains the existing form. The permanent account/server deletion confirmations and owned-server warning were inspected; destructive results were exercised through isolated API tests.
- Actual browser: a revealed spoiler image retained one image mount and zero removals through nine repeated reaction changes. A separate multi-reaction check retained the image while three distinct emoji groups were present. Message options showed Copy, Pin/Unpin and Delete without the duplicate Pinned messages browser.
- Actual browser with two disposable Socket.IO accounts: X hid an incoming invitation with zero decline events. Explicit Decline produced one decline event.
- Actual browser: Kick hid Duration. Changing back to Ban restored an enabled themed duration control, and Permanent ban changed back to a valid timed mute. A real temporary mute displayed its reason/countdown, removed the composer and blocked the room entry before microphone capture. A real timed-ban rejoin attempt showed the reason, remaining time and end time in a separate dialog.
- Actual browser: the prepared Skypixel community had its supplied artwork, 15 channels, six custom roles and a first-position Official discovery card. The rules reader had nine section headings and an independent content scroller. Its content and close control stayed within all eight tested widths/heights, without horizontal overflow. The phone reader starts with its section list collapsed to leave space for reading.
- Chat header tools remained on one row, with 4–6 pixel gaps and no horizontal overflow across all eight sizes. A component-only voice fixture kept five controls separated by 10 pixels, inside the viewport. The shortest 320x480 case was refined to a zero-pixel horizontal center difference and controls ending at y=456 within the 480-pixel viewport. This fixture does not establish a real remote-media connection.
- The PNG and GIF setup files match the supplied originals byte for byte. The supplied GIF has **one frame**; it is a still banner. No animation frames were invented or lost by the importer.

Test viewports: 320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080. These are browser geometry checks, not physical iPhone/OS-keyboard certification. No new remote audio/video delivery claim is made; the native media/relay limitations recorded for 2.9 below still apply.

## Retained 2.9 follow-up evidence

- All 97 automated tests pass. The RTC fake now reproduces the native rule that addTransceiver-created answerer slots remain unassociated with an incoming offer. The regression test checks adopted sender tracks, retired local slots, MID identity, independent screen/camera stopping and existing collision behavior.
- New audio-activity tests check RMS signal energy, silence, release timing, mute, source reuse, analyser cleanup and preservation of live microphone tracks.
- The real GIF picker rendered a controlled GIPHY response. It kept 140-pixel cells before and after Load more (24 to 48 results), with scrolling inside the results area. No live user API key was supplied; the mocked provider fixture is not in the archive.
- A real uploaded 1600x900 MP4 opened through the production in-app viewer. At 320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080, the video stayed inside the stage and its scrollWidth/scrollHeight equaled the available client bounds.
- At 390x844, server Search/Pins/Members shared the same header row (y=74, each 40 pixels high); the 61-pixel header had no horizontal overflow. Category headings use uppercase styling and the redundant Channels label is gone.
- Native synthetic audio activated two local speaking tiles (camera/presentation), mute cleared both, and unmute restored both. Three existing video elements remained present. This proves local analysis, not remote audio delivery.
- Native camera/presentation components at 320x480, 390x844, 844x390 and 768x1024 kept every tile inside the voice view without horizontal overflow. Portrait phones used one main presentation column and two bounded camera thumbnails. This is component resizing in Chromium, not physical Safari certification.
- Native WebRTC peers reached stable signaling. The browser gathered zero ICE candidates and received zero inbound bytes/decoded frames. Cross-device camera/screen/audio transport therefore remains unverified and requires deployment testing with actual HTTPS/TURN and physical devices.
- Creator registration/identity tests remain passing. Account settings expose only the signed-in account's permanent ID/status; creator tokens remain private server configuration. See CREATOR_SETUP.md.

## Follow-up checks in 2.8.2

- All 94 automated tests pass. New cases cover server/DM unread aggregation, official-marker coexistence, 99+ count formatting, text/emoji continuation groups, and author/reply/time boundaries.
- A real HTTP/Socket.IO integration test confirms two room counters persist independently, a read receipt reaches the other session, reading one room leaves the other unread, reading both clears the total, and own messages do not count.
- A real incoming server message while viewing a DM raised the global Servers indicator. Opening Servers identified Evening club with 1 unread message. Opening its general channel cleared the indicator after the read receipt.
- Receiving a message while reading older server history retained the unread count and reading position. Scrolling back to the newest message with the real wheel cleared both the server indicator and Jump to latest.
- The DM profile date and View profile action measured exactly 20 pixels apart.
- Real consecutive text and emoji messages were measured at 320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080. Each internal gap measured 6 pixels, all five messages used the same content-column left edge, and message rows had no horizontal overflow.
- Browser checks use isolated disposable accounts. No QA endpoints, records, environment values or installed modules are packaged. Earlier release checks below remain historical evidence for retained features.

## Follow-up checks in 2.8.1

- All 91 automated tests pass. A new client test checks complete display names, escaped name text, singular/plural wording, a bounded multi-writer summary and separate typing/counter/shortcut slots.
- Actual profile settings were measured at 320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080. Both artwork groups and all six action buttons stayed within their bounds; phone controls were 44 pixels high. Larger screens use matching side-by-side groups.
- Server icon/banner groups used equal widths and aligned tops. Adjust banner opened the existing crop editor, and cancelling returned to the unchanged settings draft.
- A real Socket.IO typing event from a second disposable account displayed the complete **QA Bob is typing…** label on phones and desktops. It coexisted with **6,720 / 8,000**, remained visible through viewport changes, expired independently and left the counter intact. No message was sent from that long draft.
- The long-draft landscape check exposed a clipped footer at 844x390. Bounding the expanded input on short screens fixed it; final measured Send bottom was 356 pixels and typing bottom 385 pixels within the 390-pixel viewport.
- No new schema migration, dependencies, production data, QA routes or test records are included in the archive. Physical-device keyboard testing remains subject to the deployment boundaries below.

## Automated checks

`npm run check` verifies 27 server/test scripts and 24 browser modules. `npm test` passes 97 tests using actual HTTP/Socket.IO servers, temporary SQLite databases and deterministic media/audio substitutes.

Retained coverage includes registration/sign-in, password hashes, session cookies, canonical origins, reverse-proxy request proofs, account isolation, private DMs, membership, private channels, message ownership, reactions, pins, history, live revocation, persistence, discovery, upload ownership, streaming/ranges, immutable usernames, creator identity/official ordering, categories, moderation, complete DM deletion, 8,000-character boundaries, duplicate suppression, presence/DND, blocks, provider references, sounds, capture/signaling and reconnection.

Retained 2.6 checks cover:

- Basic member defaults, Allow/Deny/Inherit resolution, explicit denial of implied powers and owner authority.
- Denied/allowed posting, reactions, topic creation/replies and pins; lost view permission over HTTP and the live socket.
- Delegated role management, protected/self roles, missing-power escalation, self-assignment and role-image uploads.
- Channel cover ownership/server/purpose checks, no orphan channel after invalid cover, Q&A question/reply association, author/manager authority, hidden blocked answers and deletion of an accepted reply.
- Media/Resources content requirements, filename search, preservation of incompatible history during rejected conversion, uploaded image inline/download separation, successful DM/Media downloads and unauthenticated denial.
- Independent microphone, camera and screen permissions and removal from an active room after access revocation.
- Version-one migration, plus a version-five fixture with real persisted history/roles/invite. The schema-6 invitation migration runs once and retains later permission edits on restart.
- Resizer bounds across phone/tablet/desktop sizes, invalid saved widths and simultaneous desktop panels that retain a usable conversation area.

## New automated coverage in 2.8

- Retired channel types reject new creation/conversion; a schema-7 fixture migrates to schema 8 without losing roots/replies, pins/revisions, cover associations, document spoiler metadata, file paths, roles or subsequent edits on restart.
- Media accepts document uploads while requiring an attachment, retains filename search and enforces explicit image-download policy.
- Crop metadata rejects unknown keys, nonnumeric/out-of-range positions, invalid zoom and crop targets outside a message. Profile/server/channel/role positions persist; original GIF bytes remain exact. A document cannot receive an image preview crop.
- Role flags/order persist; owner-only ordering validates the exact ID set atomically. Display order does not change permissions, ownership or role delegation.
- Client tests cover meaningful latest-button distance, tiny clicks/scroll cases, one-group-per-online-member, offline grouping, safe crop styles, profile order, forum publishing versus reply composers, joined mention highlights and hidden document spoilers.
- Gesture tests verify right-swipe reply, left-swipe actions, long-press timing and cancellation after movement. Existing scrolling, preferences, permission, upload, presence, sound and RTC tests remain covered.

## 2.8 browser checks retained from the prior release

Disposable accounts used the real HTTP/Socket.IO service, rendered controls and native file chooser. No runtime QA records/endpoints, real environment values, installed modules or screenshots are packaged.

- Server rules rendered a real heading, bold text, a list and an emoji shortcode in the wider styled view. Raw markup/link/code safety is additionally tested.
- A Forum switched to List, opened New post, uploaded a real GIF, marked it as a spoiler, created the post and opened/replied to its separate conversation. Forum/gallery roots have no Jump to latest control.
- Real image/document pending cards measured 264 pixels. Spoiler/remove buttons stayed fully inside each card without horizontal overflow.
- Existing avatar positioning changed x/y/zoom, saved and propagated to the user-bar image. A new banner upload automatically opened its editor with SECTION focus; native drag changed its position. The editor fit all eight viewport sizes. An attachment image preview was positioned and its saved gallery style matched the selected metadata. Original bytes remain covered by HTTP tests. An ordinary DM image button measured 301 pixels against a 300.95-pixel image, matching within subpixel rounding instead of spanning the message row.
- Notices kept app, navigation and modal geometry identical before/after; reserved height stayed zero. Swipe dismissed a notice. The role-save notice chose a free gap and did not overlap the member checkbox or other controls in the observed phone workflow.
- A visual icon picker had 20 buttons and 20 SVGs with no overflow. Selecting Music saved through channel settings. The channel-type menu offered Text, Announcements, Forum and Media gallery, with no retired types. Role/permission menus used themed options; Escape closed the menu without closing settings.
- A role was created with separate display, assigned to a real fixture member, and reordered above the owner display entry. Members showed Designers/Server owner in that order. After the peer disconnected, the member moved to the shared Offline group and retained their role label.
- Production touch-event fixtures triggered Replying to QA Bob and Copy text/Pin/Pinned actions. The action-opening callback avoids swallowing its own click. Unit tests additionally verify the long press/cancellation. These are not physical-touchscreen certifications.
- Two actual consecutive @here messages joined their background corners: first bottom-left and second top-left radius were zero. Mention widgets and message grouping remained present.
- The actual emoji picker mounted 118 Faces choices with 28-pixel glyphs in 44-pixel-tall cells, with no overflow. A selected reaction rendered at 22 pixels inside a 36-pixel-tall control. Emoji-only messages rendered at 32 pixels.
- DM, Media and Forum grid views had no horizontal overflow across eight sizes. After the orientation fix, body height matched each viewport immediately, Send remained inside it, and no false latest button appeared. No Nexus application console error was observed; browser-extension metadata errors were outside Nexus.

Viewport sizes: **320x480, 320x640, 390x844, 844x390, 768x1024, 1024x768, 1366x768 and 1920x1080**. Browser geometry and synthetic touch checks do not certify actual OS keyboards, native gestures or every physical device. Overlay-keyboard/rotation acceptance still needs the supported phones/tablets. Provider/remote-media boundaries below remain unchanged.

## New automated coverage in 2.7

- Preferences require the current account, reject unknown/invalid settings, merge partial patches and notify separate authenticated sessions. Client cases cover an in-flight reversal, a persisted offline queue and a stale response after sign-out/account switching.
- `@everyone` requires its own role grant, respects private channels and blocks, and does not leak into DMs. `@here` stays in its DM. Escaped/code mentions do not notify.
- Spoiler flags survive server history and reject files outside the message and non-image files.
- Pin revisions/read state synchronize sessions; an older acknowledgement cannot consume a later pin, and blocked pins do not affect the visible count/dot.
- Q&A filters distinguish unanswered and solved roots and hide blocked accepted answers.
- Markdown escapes HTML, rejects executable links, preserves code and renders supported formatting. Touch classification checks distance and direction.
- A deterministic scroll/animation clock verifies a pin anchor through image resize, no forced history jump, an intermediate animated position and cancellation by user intent.
- A schema-6 fixture loses no existing messages, roles or pins when upgraded to schema 7; account preferences and pin reads persist after reopening.

## Retained 2.7 browser checks

The top notice row, segmented presence outlines, Q&A filters and Resources view described here are historical evidence, superseded by 2.8.

The real client used disposable accounts and files against the actual HTTP/Socket.IO backend. UI actions used the rendered controls and a native file chooser. QA endpoints, wrappers, real environment values, runtime databases and screenshots are excluded from the ZIP.

- An actual connected peer changed DND to Idle. The DM header changed from Do not disturb to Away while the message-list node and sidebar avatar image remained identical. No avatar reveal animation restarted in the settled measurement.
- The header pin button is beside Search; no tall pinned strip remains. A new real pin showed the dot. Opening the list cleared this account's indicator, while integration tests verify separate-session synchronization.
- An older DM pin and an older server pin outside the initial page loaded the target window and placed the target inside the viewport. The view stayed in history with approximately 2,000 pixels below it. An incoming DM preserved the pinned position and exposed the new-message Jump to latest button. Jump to latest reached the bottom and hid the button.
- Smooth-scroll progression/cancellation is verified with the deterministic clock. Background browser-frame throttling prevented treating browser samples as a frame-rate benchmark; no 60 FPS or universal animation-performance claim is made.
- A hidden spoiler contained zero image elements. Clicking revealed it; leaving for Servers and returning to Messages hid it again with no image mounted. A real GIF upload was marked as a spoiler in the composer and sent through the real backend.
- Personal settings opened with focus on the dialog SECTION, not an input. Profile inputs were inside the actual scrollable page. Native wheel scrolling went down and back up. Header/tabs stayed fixed; selecting Account/Appearance/Profile retained the same modal and tabs, per-section position and a disposable unsaved profile draft. Discard cleaned that draft.
- Selecting Ocean in the narrow UI updated the other live tab and displayed the saved account state. Separate authenticated-session synchronization, offline replay and account isolation are additionally covered by HTTP/client tests. This is not physical-device certification.
- Settings fit all six viewport sizes. At 320x640 the dialog was 296x616; at 390x844 it was 366x820. Server General/Permissions navigation worked. General retained its scrollable page and dialog focus. Desktop server tabs measured 40 pixels high with 8-pixel gaps.
- DM headers, composers, question rows/filter bars and document resources had no horizontal overflow at the six sizes. Q&A retained two questions and its compact cover, with separate Unanswered/Solved filtering. Resources showed document filenames, extension icons and metadata, and no ordinary text composer.
- At 1,366 pixels, both maximum desktop sidebars measured 420/480 pixels, leaving a 466-pixel conversation. The compact header retained Call, Search, Pins, Profile and More, each 40x40, without horizontal overflow. The 320-pixel DM header used the same 40x40 targets with spaced rows.
- An observed notification measured about 76 pixels high; the dialog began below it with a 12-pixel gap. There was no overlap. A touch PointerEvent fixture dismissed the notice horizontally and the sheet from its handle vertically. This verifies production event handling, not native gesture behavior on every physical touchscreen.
- Server sidebar image/frame bounds matched at 40x40. Profile account badges appeared beside the display name; the server's role remained in a separate labeled section. Presence strokes are 3.5 pixels. Message avatars align to the start of long message content.
- No Nexus application console error was observed in these workflows. Browser-extension metadata errors originated from an extension, outside Nexus.

Viewport sizes: **320x640, 390x844, 768x1024, 1024x768, 1366x768 and 1920x1080**. Browser viewport checks do not certify physical keyboards, native touch behavior, every display scale, browser version or operating system. Real-device keyboard/rotation and deployment-specific media checks remain part of host acceptance testing.

## Retained 2.6 browser checks

The real client used isolated disposable development accounts and actual uploads. No QA accounts, fixture endpoints, credentials, runtime databases or screenshots are included in the product ZIP.

- Create channel appears in the server dropdown with Rules, invitations, settings and Leave server. The channel sidebar has no duplicate plus control. The Nexus brand is an inert container.
- Both sidebars were resized with native pointer drags, and with keyboard End at their maximums. At a 1,363-pixel viewport the maximum left/right widths were 420/480 pixels, leaving a 463-pixel main area with no horizontal overflow. A later drag produced 319/380 pixels, matching the divider accessibility values and panel measurements.
- Avatar images fill the complete inner frame. Profile measurements were exactly 90x90 pixels on phones and 104x104 pixels on larger sizes, with matching image position and dimensions. Small avatar measurements were 40x40 and gallery metadata 22x22. Presence is outside the image frame.
- Profiles show separate Nexus badges and Server roles sections, including the server name. Badge boxes stayed 28x28 pixels across all six viewport sizes.
- A Media channel loaded actual GIF attachments, switched between Grid/List and showed no ordinary chat input. Add media opened a publishing dialog, accepted a native file chooser upload, showed its preview/caption and published the actual third file. No Publish action was available during upload.
- Clicking an image opened the in-app viewer with zoom, Fit and navigation. Zoom enlarged the image inside the scrollable stage. The explicit Media Download action produced a native browser download. A forum topic image opened in the same viewer without Download. No image opens through an external-window image link.
- A forum was created from the dropdown with a cover uploaded through the native file chooser. Its saved channel cover and the existing forum topic thumbnail were visible. Q&A showed a solved question, separate reply thread, accepted-answer badge and jump control. Answer authorization/change behavior is additionally verified through HTTP tests.
- Joining a Stage as an audience member did not request microphone/camera capture. Members hid by default; the toggle restored the panel while the room stayed active. The microphone control remained disabled. Returning to text restored its separate panel preference.
- Server settings displayed the grouped permission editor, and profile/permission dialogs retained readable controls at small sizes. No application console error was observed during these workflows; browser-extension metadata errors were external to Nexus.
- Computed selection rules were `none` for decorative interface content and `text` for a gallery caption. Editable fields, messages, captions, bios, rules and usernames are explicitly selectable.

Gallery, image viewer, profile and server-permission layouts were measured at **320x640, 390x844, 768x1024, 1024x768, 1366x768 and 1920x1080**. Page/header/gallery controls/cards and permission rows had no horizontal overflow. The viewer measured 296x616 pixels at 320x640, 366x820 at 390x844 and up to 1280x900 on desktop, fully inside each viewport. Profile and permission dialogs also fit their widths.

These are browser viewport checks, not certification of every physical device, operating-system keyboard, browser version or display scale.

## Retained browser evidence from 2.4/2.5

The preceding releases verified DM navigation from a server profile; a persistent personal-settings dialog with drafts across tabs; unsaved server settings surviving child-channel settings; a pasted-image fixture reaching the real upload handler; 8,001 characters disabling Send; follow-bottom versus manual history scrolling and Jump to latest; compact pin navigation; visible voice participant names/avatars; and chat/settings widths at the same six sizes.

The 2.5 emoji picker rendered only the active category (118 Faces choices), with seven category tabs. Measured DOM mounting was approximately 8–10 ms in that development browser. Food selection inserted an emoji into a real DM composer. The emoji grid/picker fit the six sizes. Profile/role badges measured 28 pixels, and Official/Joined chips shared 26-pixel height/baseline. Ocean changed shared dark palette tokens. Blocking removed a disposable peer; Unblock restored accessible history. Sign in remained the unauthenticated default.

The old creation-button location and dot-style presence described by historical release notes are superseded by 2.6. Historical timing is not a new whole-application performance benchmark.

## Large-file boundary

Attachment/profile/server-image purposes accept a declared 5 GiB file and reject one byte above it. Streamed chunks reconstruct exact bytes; a lost-response offset is not duplicated, a new authenticated session resumes it, and repeated completion returns the same file ID.

A sparse disposable file verifies the full 5,368,709,120-byte boundary without allocating or transmitting five gigabytes. The last chunk is written above the 32-bit offset range, final size is checked, and an authenticated HTTP Range request retrieves the exact last bytes. This verifies size/offset/streaming paths, not a 5 GiB bandwidth benchmark or efficient huge-image decoding on a phone.

## Provider and media boundaries

GIPHY missing-key behavior was observed in the browser. Exact query encoding, bounded pagination, cancellation, provider failure and reference sending are tested with deterministic responses. A production provider key/quota was not available, so live GIPHY search and provider-CORS download are not marked as passed.

Prior native RTCPeerConnection checks used two authenticated NexusCall instances with synthetic camera/microphone/screen sources. Signaling reached stable offer/answer states. Local camera and screen rendered at 1280x720 and screen occupied the main presentation area. Microphone mute did not remount media.

That environment gathered zero ICE candidates and decoded zero remote frames, with zero inbound media bytes. Remote bidirectional audio/video is therefore **not** marked as passed. Independent sender/MID mapping, negotiation, reconnect and permission checks are tested, and TURN configuration with optional expiring credentials is included. The archive does not provision a relay. Finish cross-device/cross-network testing on the chosen HTTPS host with a working TURN relay; see VOICE_DEPLOYMENT.md. Mesh capacity remains eight participants.

## Packaging and operations

The release retains the original Nexus layout, unchanged proprietary Skypixel license, original legacy records, pinned dependency lockfile and startup files. Runtime data, real environment values, installed dependencies and QA harnesses are excluded.

A public-launch security audit, distributed load test, content scanning, account storage quotas, TURN provisioning, SFU scaling and end-to-end encrypted stored messages are not claimed. See SECURITY.md and ROADMAP.md.
