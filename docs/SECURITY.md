# Security and privacy behavior

Nexus protects server routes with authenticated, hashed sessions and checks membership, private-channel roles and ownership for each conversation action. Mutating browser requests require trusted origins or session-bound request proofs. SQL parameters bind user input. Uploaded filenames never control disk paths; image signatures determine the image content type. Responses use nosniff, same-origin cross-origin resource policy and a restrictive content security policy including same-origin form actions.

Conversation attachments are available to their participants and authorized server members. Revoking access, leaving, kicking or banning removes that access for HTTP requests and live socket rooms. Profile-image files are limited to the owner and accounts related by a shared server or DM. Publicly listed server icons/banners are intentionally visible to signed-in discovery visitors. Custom role images remain server-member assets. Private file responses use no-store and are not published as a public upload directory.

The public web client must be delivered to browsers, so its HTML, CSS, JavaScript and displayed assets can be inspected or copied by their recipients. Authentication cannot prevent a person from saving a picture they are allowed to view or taking a screenshot. Server source, environment values, SQLite files and update backups are outside the static public directory and are not served as client files. The original license governs source redistribution; this is not technical copy prevention.

Messages are stored in SQLite so participants can retrieve history and reconnect. Removing the composer storage hint does not disable persistence. Stored text and attachments are not end-to-end encrypted; an authorized host operator can access its storage. Administrative audit entries contain actions and actor/target IDs, not message bodies. Console logging reports startup, connection state and errors without recording passwords, request proofs, relay secrets or message bodies.

Abuse controls include authentication limits, per-account API and mutation limits, duplicate-message suppression, message and upload rates, chunk rates, download rates, typing/call limits, per-account socket-event limits, connection limits, channel slowmode, channel/category/role bounds and voice capacity. Limits are configurable in server/config.js. They are process-local, not a substitute for an edge DDoS service or distributed rate-limit storage.

Partial uploads and unused completed assets expire. The 5 GiB per-file limit still requires suitable disk capacity and an operational storage policy. Antivirus/content scanning, per-account storage quotas, reporting workflows and a full security audit remain deployment work. Never publish the private data directory, environment file or TURN shared secret.

Creator badges use an immutable account ID. On a fresh installation the reserved creator username needs a server-configured claim token. Knowing or copying a display name cannot grant a creator badge, official server flag, moderator role or permission. Remove a one-time creator claim token after use. Use expiring TURN credentials on public deployments.

## Blocking and provider GIFs

Blocks are stored by immutable account ID with ownership and foreign-key constraints. HTTP history, pins, search, files, unread counts and live delivery enforce the block on the server. Direct contact and signaling are denied while either side blocks the other. The client closes existing peer transports and removes their playback elements. Server moderators retain their normal administrative powers; blocking is not a ban or deletion.

GIPHY requests originate from authenticated browsers using a web API key. The key is browser-visible by design and must be domain-restricted with the provider. Nexus cookies are omitted from these requests. The backend accepts only validated HTTPS GIPHY CDN references as provider attachments, applies normal attachment permissions and persists no provider API key inside messages. See GIF_SEARCH.md.


## Permission and download enforcement

The server resolves basic member defaults plus assigned role grants and denials. It checks action-specific permissions for posting, attachments, downloads, reactions, pins, topic creation/replies/answers, connection and capture, invitations, moderation, channels, roles and activity. Explicit denial wins, while the owner retains control. Delegated role management cannot grant protected management powers, alter the delegate's roles or assign itself additional roles. Current access is rechecked for files and sockets; permission changes invalidate bounded caches and refresh authorized rooms.

Forum covers are authenticated channel assets, checked against their server before channel creation and against channel visibility when read. Role icons have their own upload permission and remain server-member assets. Partial/unused upload cleanup preserves currently referenced covers and icons.

The application offers uploaded image Download only for DMs and Media channels and checks the same policy at the authenticated download endpoint. Server download permission also applies. Inline media access is still required for viewing; a recipient can retrieve those bytes through their browser or take a screenshot. Covers, profiles and server artwork have no explicit download action. This distinction prevents an application-level download action; it cannot prevent copying content already delivered to a recipient.

## Message formatting, preferences and pin receipts

The Markdown renderer used for messages, captions, rules, biographies and descriptions bounds input length and nesting, escapes raw HTML, and permits HTTP(S) links without embedded credentials. It never executes message markup or embeds arbitrary HTML. Mentions in code examples or escaped `@` text do not create notification recipients. Server `@everyone` requires an explicit non-basic permission, a group-mention rate limit and current recipient/channel access; it cannot cross a private-channel boundary.

Account preference routes require a current session and accept only eight documented portable keys with validated types/ranges. Partial changes merge on the server and emit only to that account's authenticated sessions. Client queues are namespaced by immutable account ID; a late response after sign-out/account switch cannot apply to another account. Preferences are not an end-to-end encrypted vault. Device panel sizes and OS notification permission are not uploaded as portable preferences.

Pin lists/counts/read receipts require conversation access and filter blocked authors. Monotonic pin revisions and bounded read acknowledgements prevent acknowledging a newer unseen pin by replaying an older read. A pin receipt is an account's notification state, not another participant's message read receipt.

Spoilers hide an attachment in the interface until clicked and reset after leaving the view. Hidden media sources/download controls are not mounted in the DOM; unrevealed visual media are skipped by viewer navigation. Their metadata and file routes retain normal conversation authorization. A participant entitled to the file can still retrieve it, inspect browser memory after viewing or take a screenshot. Disabling DevTools, obfuscating JavaScript, blocking right-click or hiding a download button cannot protect content already sent to a browser. No such copy-prevention claim is made.

## Artwork and display metadata

Schema 8 stores numeric artwork positions and zoom, never user-supplied CSS. Position must be finite within 0–100 and zoom within 1–4; unknown keys/types are rejected. Profile changes apply to the current account, and server/channel/role images retain their existing ownership/purpose checks. Attachment preview crops can reference only images actually attached to that new message. Original file bytes and GIF animation are unchanged. Crop coordinates are presentation metadata visible to the same authorized viewers as the artwork.

Member-role display order does not create a security rank. Reordering requires server ownership, validates the exact role-ID set and saves atomically. Role display flags still obey protected-role/delegation checks. The owner display entry cannot be assigned to another member through role editing; ownership transfer remains a separate authorized operation. Retired channel migration preserves the original channel access rules and never merges different conversations.

## Account authentication and recovery

Login normalizes only the permanent username: optional `@`, copied surrounding whitespace, ASCII case and compatibility characters. Password bytes are never trimmed or normalized. Existing scrypt hashes remain valid and malformed hashes fail closed. Sign-in rechecks the stored hash after asynchronous derivation so an in-flight old-password login cannot create a new session after a reset. Unknown/corrupt accounts still perform a dummy password derivation. Production storage and password-hash contents must be protected separately from the public website.

Recovery email enrollment/removal and code replacement require a current authenticated session and current-password verification. The session and original password hash are rechecked after asynchronous verification, preventing a revoked session or concurrent reset from modifying recovery settings. Only a verified address can request a mail reset. Pending changes retain the previous verified address until confirmation, and a verified address is unique to an account.

Password-reset links contain 32 random bytes, expire after 20 minutes, use a fixed configured origin and keep the secret in the fragment. Verification links expire after 24 hours. Opening a link is read-only until the explicit POST. Recovery codes contain 16 random bytes each. Database storage uses domain-separated SHA-256 hashes for these high-entropy proofs. Raw tokens/codes are not logged or included in public user/config responses. Email delivery necessarily receives the destination and the single-use link; recovery email addresses are private account metadata, not encrypted from the host operator.

Generic request responses, IP/account limits, cooldowns and bounded asynchronous mail queues reduce enumeration/abuse. SMTP requires TLS with certificate validation and disables URL/file loading in mail content. Provider errors are logged only as bounded classifications. Limits and the mail queue are process-local; queued mail is not a durable job system. A restart may discard an unsent request, after which the member can request a new link. Provider/mailbox compromise remains a recovery risk.

After password hashing, recovery proof ownership/expiry is rechecked inside the write transaction. Success preserves account records but revokes all sessions, realtime access, outstanding tokens and every old code. It never auto-signs in the holder. Existing accounts without an enrolled verified address or saved code cannot self-recover based only on their username. See [account recovery](ACCOUNT_RECOVERY.md) for host setup, enrolment and support boundaries.

## Host-assisted recovery and unverified saved email

Saving an address without mail delivery does not verify or activate it. The route still requires the current password/session and clears obsolete verification/host proofs. Later delivery requires a new verification request; no queued unverified address is automatically trusted. A Gmail address is an ordinary recovery destination, not permission to use the mailbox or request its password.

The private host tool requires database/filesystem access, an immutable ID with matching username, and explicit operator attestation after a separate ownership check. The attestation is not automated identity proof. It creates a random 256-bit, 15-minute single-use link bound to the current password hash and fixed trusted origin, stored hashed in an additive schema-11 table. Expired/replaced/revoked/password-stale proofs fail closed. Issuance and private-file writing are transactional; a failed write rolls back the proof replacement. The temporary plaintext handoff file is outside the public/upload paths and must be handled as a credential and deleted after use. POSIX modes do not replace Windows NTFS policy.

Only redemption changes the account. The existing password-reset transaction rechecks the host proof after password hashing and removes all sessions, outstanding proofs/codes and old recovery-address bindings. Realtime sessions disconnect immediately. Old addresses receive a notice when configured, without a new reset secret. API users, community owners and moderators have no host-proof issuance route. Host administrators already control the underlying database; secure operator access and independent identity verification are essential boundaries.

Context menus add no server privileges. Permissions/targets are resolved again at selection and remain checked by the API. Protected image-download policy, block checks, spoilers and destructive confirmations remain in effect. Native context menus are retained where needed for text editing and media controls.

Recovery design references: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) and [NIST account recovery](https://pages.nist.gov/800-63-4/sp800-63b/events/#recovery). This implementation is not a claim of NIST certification or an independent security audit.

## Public link cards and reduced motion

Only the bundled Nexus card and icons are public preview assets. Metadata is generic and does not publish personal images, memberships, message contents, invite parameters or recovery proofs. The configured origin is validated; forwarded hosts are not accepted as a substitute. Existing file authentication, block, membership and download checks remain in force.

Local motion stills stay in temporary browser memory. They are not uploaded, persisted to localStorage or exposed through a new server endpoint. Sign-in/recovery screens clear the prior account's still cache and invalidate pending cache work. GIPHY static references are checked against the same provider identity as the animated reference; no arbitrary still host or active format can be stored through the message API.


## Background notification boundaries

Schema 12 stores private push subscriptions and an expiring outbox. Authenticated same-origin mutations validate the endpoint provider, HTTPS, absence of URL credentials, P-256 receiver key and device identifier. Only recognized browser-service hosts can receive outbound requests; arbitrary user URLs and private-address targets are rejected. Provider endpoint URLs are capabilities and remain server-side. The VAPID private key is generated into the private database, never returned in public config, logs or archives.

Each subscription references a live account session with cascading deletion. Logout, password reset and account deletion remove its delivery authority. Sending rechecks DND, blocks, conversation access, read state and recent per-device foreground activity. The worker accepts only the current account binding and fixed generic alert content; navigation accepts only validated same-origin conversation identifiers. In-flight provider requests cannot be recalled. Bounded queues, coalescing, per-account settings/test limits, timeouts and job expiry reduce abuse; they do not guarantee delivery or replace host capacity controls.

Web Push payloads use the standard encrypted content encoding and VAPID supplied by the pinned web-push dependency. Generic routing metadata is encrypted in transport, but provider timing, endpoint and the operating system's visible notification remain observable. This is not a claim of end-to-end encrypted chat or host-inaccessible storage. Worker IndexedDB contains minimal binding/public-key data, with no messages or private signing key. It has no fetch handler/private offline cache. See [push operation](PUSH_NOTIFICATIONS.md).
