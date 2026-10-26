# Nexus 2.5.0

This release fixes the visual issues reported in the emoji picker, profile badges, discovery cards and presence indicators, and adds account blocking, interface palettes and a live GIF-search integration.

## Emoji and performance

- The picker renders one category at a time instead of nesting every category inside another four-column grid. The initial Faces category has 118 separate buttons.
- All seven category tabs remain visible in two rows. Arrow keys navigate categories and emoji buttons. Selection inserts the chosen emoji at the message caret or adds a message reaction.
- The grid has independent vertical scrolling, bounded dimensions and no horizontal overlap. Its position updates after resize, virtual-keyboard resize and asynchronous content changes.
- The measured development-browser DOM opening time was approximately 8–10 ms. This is an observation in the test environment, not a guarantee for every device or a whole-application load benchmark.

## Live GIF search

The GIF button now opens **GIPHY** search and trending results instead of searching the sixteen local greeting cards. Results use lightweight previews, 24 items per request, 350 ms input debounce, cancellation of superseded requests and a Load more button. Choosing a result adds a composer preview; sending stores the provider reference with the message. Existing local GIF messages remain readable.

The hosting operator must set `GIPHY_API_KEY` in the private `.env` file and restart Nexus. See [GIF_SEARCH.md](GIF_SEARCH.md). The server returns the web API key only to authenticated browsers; it is intentionally visible to those browsers because GIPHY requires direct client requests. Restrict the key to your deployment domains in the provider dashboard.

No API key is bundled or borrowed. Without a configured key the picker explicitly says the service is unavailable. Tests use disposable provider responses; a production GIPHY key and live provider quota were not available for an end-to-end provider test.

## Visual consistency and navigation

- Profile badges are 28-pixel icon boxes with accessible names and descriptive tooltips. Role chips share the same 28-pixel height.
- Official-server and Joined chips share a 26-pixel height, common baseline and a six-pixel gap. They wrap as a group without overlapping.
- Presence marks are 18 pixels on ordinary avatars and 23 pixels on profile avatars. DND has a dash, idle a crescent, and offline a hollow ring, with accessible text labels.
- New visitors see Sign in first and can choose Create account.
- The server menu and server overview no longer duplicate the sidebar's Create channel control.
- Channel/category gears are hidden until pointer hover or keyboard focus. Touch layouts expose the selected channel's gear; server settings also provide channel management.
- Settings → Appearance offers eight palettes that change shared dark backgrounds, navigation, controls and accents. Dark mode stays enabled. Selection is immediate and saved on the device, including across tabs.
- Personal settings tabs wrap on phones. Changing tabs preserves the mounted dialog. An asynchronous blocked-user request cannot reopen a dismissed settings window.

## Blocking

Use Block user in a DM header or another person's profile. A confirmation explains the result. Settings → Blocked users provides Unblock.

A block is stored by immutable account ID and survives display-name changes and server restarts. For the person who sets the block, the target's server messages, threads, pins, reactions, typing, presence updates, member rows and uploaded personal/attachment media are hidden. Hidden messages do not add to unread counts. Whole hidden topics and their replies stay out of search results and history windows. Public server artwork remains available according to its normal permissions.

Both accounts are prevented from creating or sending DMs or inviting direct calls while either side has a block active. Existing direct calls end. In shared server voice rooms the two accounts are omitted from each other's peer lists, their current peer transports close, and further signaling between them is denied. They can continue talking with other participants. Removing the last block restores the server-room peer connection attempt without ending the room.

Blocking does not delete conversation history or remove someone from a server. Unblocking reveals accessible history again. Moderation permissions remain separate. Message storage is not end-to-end encrypted, and the existing cross-network media deployment requirements still apply.

## Upgrade

Keep your original `data` directory and `.env`. Back up the database and uploads, replace the application files, run `npm ci`, restart Nexus and refresh the browser with Ctrl+F5. Database schema 5 adds the block table and indexes without removing accounts, messages, uploads or settings.

The original proprietary Skypixel license, original directory layout, legacy records and dependency lockfile are retained. QA pages, disposable accounts, credentials and measurements are excluded from the ZIP.
