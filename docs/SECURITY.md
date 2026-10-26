# Security and privacy behavior

Nexus protects server routes with authenticated, hashed sessions and checks membership, private-channel roles and ownership for each conversation action. Mutating browser requests require trusted origins or session-bound request proofs. SQL parameters bind user input. Uploaded filenames never control disk paths; image signatures determine the image content type. Responses use nosniff, same-origin cross-origin resource policy and a restrictive content security policy including same-origin form actions.

Conversation attachments are available to their participants and authorized server members. Revoking access, leaving, kicking or banning removes that access for HTTP requests and live socket rooms. Profile-image files are limited to the owner and accounts related by a shared server or DM. Publicly listed server icons/banners are intentionally visible to signed-in discovery visitors. Custom role images remain server-member assets. Private file responses use no-store and are not published as a public upload directory.

The public web client must be delivered to browsers, so its HTML, CSS, JavaScript and displayed assets can be inspected or copied by their recipients. Authentication cannot prevent a person from saving a picture they are allowed to view or taking a screenshot. Server source, environment values, SQLite files and legacy records are outside the static public directory and are not served as client files. The original license governs source redistribution; this is not technical copy prevention.

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
