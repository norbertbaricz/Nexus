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
